'use strict';

/**
 * @file Node.js bindings for TrailDB.
 * Note: At this time, supports synchronous execution only.
 */

const ffi = require('ffi');
const ref = require('ref');
const array = require('ref-array');
const struct = require('ref-struct');


//
// Constants
//

// traildb types
const T_TDB = ref.refType(ref.types.void);
const T_TDB_CONS = ref.refType(ref.types.void);
const T_TDB_FIELD = ref.types.uint32;
const T_TDB_VAL = ref.types.uint64;
const T_TDB_ITEM = ref.types.uint64;
const T_TDB_CURSOR = ref.refType(ref.types.void);
const T_TDB_ERROR = ref.types.int;

// array types
const T_UINT64_ARRAY = array(ref.types.uint64);
const T_STRING_ARRAY = array(ref.types.CString);

// tdb_event struct
const T_TDB_EVENT = struct({
  timestamp: ref.types.uint64,
  num_items: ref.types.uint64,
  items: array(T_TDB_ITEM)
});

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;


//
// API bindings
//

const lib = ffi.Library('libtraildb', {
  tdb_cons_init: [T_TDB_CONS, []],
  tdb_cons_open: [T_TDB_ERROR, [
    T_TDB_CONS,
    ref.types.CString,
    T_STRING_ARRAY,
    ref.types.uint64
  ]],
  tdb_cons_close: [ref.types.void, [T_TDB]],
  tdb_cons_add: [T_TDB_ERROR, [
    T_TDB_CONS,
    ref.refType(ref.types.byte),
    ref.types.uint64,
    T_STRING_ARRAY,
    T_UINT64_ARRAY
  ]],
  tdb_cons_append: [T_TDB_ERROR, [T_TDB_CONS, T_TDB]],
  tdb_cons_finalize: [T_TDB_ERROR, [T_TDB_CONS]],

  tdb_init: [T_TDB, []],
  tdb_open: [T_TDB_ERROR, [T_TDB, ref.types.CString]],
  tdb_close: [ref.types.void, [T_TDB]],

  tdb_lexicon_size: [T_TDB_ERROR, [T_TDB, T_TDB_FIELD]],

  tdb_get_field: [T_TDB_ERROR, [T_TDB, ref.types.CString]],
  tdb_get_field_name: [ref.types.CString, [T_TDB, T_TDB_FIELD]],

  tdb_get_item: [T_TDB_ITEM, [
    T_TDB,
    T_TDB_FIELD,
    ref.types.CString,
    ref.types.uint64
  ]],
  tdb_get_value: [ref.types.CString, [
    T_TDB,
    T_TDB_FIELD,
    T_TDB_VAL,
    ref.refType(ref.types.uint64)
  ]],
  tdb_get_item_value: [ref.types.CString, [
    T_TDB,
    T_TDB_ITEM,
    ref.refType(ref.types.uint64)
  ]],

  tdb_get_uuid: [ref.refType(ref.types.byte), [T_TDB, ref.types.uint64]],
  tdb_get_trail_id: [T_TDB_ERROR, [
    T_TDB,
    array(ref.types.byte),
    ref.refType(ref.types.uint64)
  ]],

  tdb_error_str: [ref.types.CString, [T_TDB_ERROR]],

  tdb_num_trails: [ref.types.uint64, [T_TDB]],
  tdb_num_events: [ref.types.uint64, [T_TDB]],
  tdb_num_fields: [ref.types.uint64, [T_TDB]],
  tdb_min_timestamp: [ref.types.uint64, [T_TDB]],
  tdb_max_timestamp: [ref.types.uint64, [T_TDB]],

  tdb_version: [ref.types.uint64, [T_TDB]],

  tdb_cursor_new: [T_TDB_CURSOR, [T_TDB]],
  tdb_cursor_free: [ref.types.void, [T_TDB]],
  tdb_cursor_next: [ref.refType(T_TDB_EVENT), [T_TDB_CURSOR]],
  tdb_get_trail: [T_TDB_ERROR, [T_TDB_CURSOR, ref.types.uint64]],
  tdb_get_trail_length: [ref.types.uint64, [T_TDB_CURSOR]]
});


//
// TrailDBError class
// TrailDB error condition.
//

/**
 * Initialize a new TrailDBError.
 * @param {String} message - Error message.
 */
const TrailDBError = function (message) {
  const error = new Error(message);
  error.name  = 'TrailDBError';
  return error;
};


//
// Helper functions
//

/**
 * Returns a UUID buffer.
 * @param {String} uuid - UUID string.
 * @return {Array[Byte]} uuid - UUID buffer.
 */
const uuidRaw = function (uuid) {
  if (!UUID_REGEX.test(uuid)) {
    throw new TrailDBError('Invalid UUID');
  }
  return new Buffer(uuid.replace(/-/g, ''), 'hex');
};

/**
 * Returns a UUID hex string.
 * @param {Array[Byte]} uuid - UUID buffer.
 * @return {String} uuid - UUID string.
 */
const uuidHex = function (uuid) {
  uuid = ref.reinterpret(uuid, 16).toString('hex');
  return [
    uuid.slice(0, 8),
    uuid.slice(8, 12),
    uuid.slice(12, 16),
    uuid.slice(16, 20),
    uuid.slice(20, 32)
  ].join('-');
};

const tdb_item_is_32 = function (item) { return !(item & 128); };

/**
 * Returns field part of an item. Ported from tdb_types.h.
 * @param {T_TDB_ITEM} item
 * @return {T_TDB_FIELD} field
 */
const tdb_item_field = function (item) {
  if (tdb_item_is_32(item)) {
    return item & 127;
  } else {
    return (item & 127) | (((item >> 8) & 127) << 7);
  }
};


//
// Iterators
//

/**
 * Initialize a new TrailsIterator. Iterator over all trails in a TrailDB.
 * @param {TrailDB} tdb - TrailDB object.
 * @param {Object} options
 * @return {TrailsIterator} iterator.
 */
const TrailsIterator = function (tdb, options) {
  this.tdb = tdb;
  this.options = options || {};
  return this;
};

/**
 * TrailsIterator iterator method under ES6 iterable protocol.
 */
TrailsIterator.prototype[Symbol.iterator] = function () {
  const self = this;
  const numTrails = lib.tdb_num_trails(self.tdb._db);
  let i = 0;

  return {
    next: function () {
      if (i >= numTrails) {
        return { value: undefined, done: true };
      }
      return {
        value : self.tdb.trail(i, self.options),
        done  : i++ > numTrails
      };
    }
  };
};


/**
 * Initialize a new EventsIterator. Iterate over all events in a trail..
 * @param {TrailDB} tdb - TrailDB object.
 * @param {Boolean} options.toMap - Whether the iterator should return a map
 *   for each event, grabbing the appropriate key names. Defaults to a list with
 *   just values.
 * @return {EventsIterator} iterator.
 */
const EventsIterator = function (trail, options) {
  this.trail = trail;
  this.options = options || {};

  this.cursor = lib.tdb_cursor_new(this.trail.tdb._db);
  const r = lib.tdb_get_trail(this.cursor, this.trail.id);
  if (r) {
    throw new TrailDBError('Failed to open trail cursor: ' + this.trail.id);
  }

  return this;
};

/**
 * EventsIterator iterator method under ES6 iterable protocol.
 */
EventsIterator.prototype[Symbol.iterator] = function () {
  const self = this;

  return {
    next: function () {
      const eventPtr = lib.tdb_cursor_next(self.cursor);

      if (!eventPtr || !eventPtr.length) {
        lib.tdb_cursor_free(self.cursor);
        return { value: undefined, done: true };
      }

      const event = ref.deref(eventPtr);
      const list = [];
      const map = {};

      for (let i = 0, addr, value; i < event.num_items; i++) {
        addr = ref.reinterpret(eventPtr, T_TDB_ITEM.size, 2 * ref.sizeof.uint64 + T_TDB_ITEM.size * i);
        addr.type = T_TDB_ITEM;
        addr = ref.deref(addr);

        value = self.trail.tdb.getItemValue(addr);
        list.push(value);

        if (self.options.toMap) {
          map[self.trail.tdb.getItemKey(addr)] = value;
        }
      }

      const value = {
        timestamp: event.timestamp,
        values: list
      };
      if (self.options.toMap) {
        value.map = map;
      }

      return { value: value, done: false };
    }
  };
};


//
// TrailDBConstructor class
// Construct a new TrailDB.
//

/**
 * Initialize a new TrailDBConstructor.
 * @param {String} options.path - TrailDB output path (without .tdb).
 * @param {Array[String]} options.fieldNames - Array of field names in this TrailDB.
 * @return {Object} cons - TrailDB constructor object.
 */
const TrailDBConstructor = function (options) {
  if (!options.path) {
    throw new TrailDBError('Path is required');
  }
  if (!options.fieldNames || !options.fieldNames.length) {
    throw new TrailDBError('Field names are required');
  }

  if (options.path.slice(-4) === '.tdb') {
    options.path = options.path.slice(0, -4);
  }

  this._cons = lib.tdb_cons_init();
  this.numFields = options.fieldNames.length;

  const fieldNamesLength = ref.alloc(ref.types.uint64, this.numFields);
  const fieldNamesArray = new T_STRING_ARRAY(this.numFields);
  options.fieldNames.forEach(function (field, i) {
    fieldNamesArray[i] = ref.allocCString(field);
  });

  const r = lib.tdb_cons_open(
    this._cons,
    ref.allocCString(options.path),
    fieldNamesArray,
    ref.deref(fieldNamesLength)
  );
  if (r !== 0) {
    throw new TrailDBError('Cannot open constructor: ' + r);
  }

  this.path = options.path;
  this.fieldNames = options.fieldNames;

  return this;
};

/**
 * Frees current TrailDB constructor handle.
 */
TrailDBConstructor.prototype.close = function () {
  lib.tdb_cons_close(this._cons);
};

/**
 * Add an event to TrailDB.
 * @param {String} uuid - UUID of this event.
 * @param {Number/Object} tstamp - Numeric date or Javascript Date object.
 * @param {Array[String]} values - Field values.
 */
TrailDBConstructor.prototype.add = function (uuid, tstamp, values) {
  uuid = uuidRaw(uuid);
  if (tstamp.constructor === Date) {
    tstamp = tstamp.valueOf();
  }

  const valuesLengths = new T_UINT64_ARRAY(this.numFields);
  const valuesArray = new T_STRING_ARRAY(this.numFields);
  for (let i = 0, value; i < this.numFields; i++) {
    value = values[i] || '';
    valuesLengths[i] = value.length;
    valuesArray[i] = ref.allocCString(value);
  }

  const r = lib.tdb_cons_add(
    this._cons,
    uuid,
    tstamp,
    valuesArray,
    valuesLengths
  );

  if (r) {
    throw new TrailDBError('Too many values: ' + r);
  }
};

/**
 * Merge an existing TrailDB to this constructor. The fields must be equal
 * between the existing and the new TrailDB.
 * @param {TrailDB} tdb - An existing TrailDB object.
 */
TrailDBConstructor.prototype.append = function (tdb) {
  const r = lib.tdb_cons_append(this._cons, tdb._db);
  if (r < 0) {
    throw new TrailDBError('Wrong number of fields: ' + r);
  } else if (r > 0) {
    throw new TrailDBError('Too many values: ' + r);
  }
};

/**
 * Finalize TrailDB construction.
 */
TrailDBConstructor.prototype.finalize = function () {
  const r = lib.tdb_cons_finalize(this._cons);
  if (r) {
    throw new TrailDBError('Could not finalize: ' + r);
  }
};


//
// TrailDB trail class
// Query events in a TrailDB trail.
//

/**
 * Initialize a new TrailDBTrail.
 * @param {TrailDB} tdb - TrailDB object.
 * @param {Integer} id - Trail ID.
 * @return {TrailDBTrail} trail - TrailDBTrail object.
 */
const TrailDBTrail = function (tdb, id) {
  this.tdb = tdb;
  this.id = id;
};

/**
 * Returns current trail's UUID.
 * @return {String} uuid - Trail UUID.
 */
TrailDBTrail.prototype.getUuid = function () {
  return uuidHex(lib.tdb_get_uuid(this.tdb._db, this.id));
};

/**
 * Returns an iterator over all events of current trail.
 * @param {Object} options
 * @return {Object} iterator - Iterator over events.
 */
TrailDBTrail.prototype.events = function (options) {
  return new EventsIterator(this, options);
};


//
// TrailDB class
// Query a TrailDB.
//

/**
 * Opens a TrailDB at path.
 * @param {String} options.path - TrailDB output path (without .tdb).
 * @return {Object} tdb - TrailDB object.
 */
const TrailDB = function (options) {
  this._db = lib.tdb_init();

  const r = lib.tdb_open(this._db, ref.allocCString(options.path));
  if (r !== 0) {
    throw new TrailDBError('Could not open TrailDB: ' + r);
  }

  this.numTrails = lib.tdb_num_trails(this._db);
  this.numEvents = lib.tdb_num_events(this._db);
  this.numFields = lib.tdb_num_fields(this._db);

  this.fieldNames = [];
  this.fieldNameToId = {};
  for (let i = 0; i < this.numFields; i++) {
    this.fieldNames[i] = lib.tdb_get_field_name(this._db, i);
    this.fieldNameToId[this.fieldNames[i]] = i;
  }

  return this;
};

/**
 * Closes current TrailDB.
 */
TrailDB.prototype.close = function () {
  lib.tdb_close(this._db);
};

/**
 * Returns an iterator over all trails of current TrailDB.
 * @param {Object} options
 * @return {Object} iterator - Iterator over selected trails.
 */
TrailDB.prototype.trails = function (options) {
  return new TrailsIterator(this, options);
};

TrailDB.prototype.trail = function (i, options) {
  const cursor = lib.tdb_cursor_new(this._db);

  const r = lib.tdb_get_trail(cursor, i);
  if (r) {
    throw new TrailDBError('Failed to open trail: ' + i);
  }

  return new TrailDBTrail(this, i);
};

/**
 * Return the string key corresponding to an item.
 * @param {T_TDB_ITEM} item - The item from EventsIterator.
 * @return {String} key - Item string key.
 */
TrailDB.prototype.getItemKey = function (item) {
  return lib.tdb_get_field_name(this._db, tdb_item_field(item));
};

/**
 * Return the string value corresponding to an item.
 * @param {T_TDB_ITEM} item - The item from EventsIterator.
 * @return {String} value - Item string value.
 */
TrailDB.prototype.getItemValue = function (item) {
  const length = ref.alloc(ref.types.uint64);
  const value = lib.tdb_get_item_value(this._db, item, length);
  return value ? value.slice(0, ref.readUInt64LE(length, 0)) : '';
};

/**
 * Return the minimum timestamp of this TrailDB.
 */
TrailDB.prototype.minTimestamp = function () {
  return lib.tdb_min_timestamp(this._db);
};

/**
 * Return the maximum timestamp of this TrailDB.
 */
TrailDB.prototype.maxTimestamp = function () {
  return lib.tdb_max_timestamp(this._db);
};


//
// Exports
//

module.exports.TrailDBConstructor = TrailDBConstructor;
module.exports.TrailDBTrail = TrailDBTrail;
module.exports.TrailDB = TrailDB;
