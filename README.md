# Node.js bindings for TrailDB

This is a Node.js client for [TrailDB](http://traildb.io), modeled after its [Python bindings](https://github.com/traildb/traildb-python).

### Quick start

    $ npm install traildb --save

### Usage example

```js

var traildb = require('traildb');
var TrailDBConstructor = traildb.TrailDBConstructor;
var TrailDB = traildb.TrailDB;

var user1 = '771799eb-6a0d-4555-9917-0a5d449b35ab';
var user2 = '8ff9b509-84a6-4888-8215-e66d7aefd1bc';

var cons = new TrailDBConstructor({
  path: __dirname + '/test.tdb',
  fieldNames: ['field1', 'field2']
});
cons.add(user1, 123, ['a']);
cons.add(user1, 124, ['b', 'c']);
cons.add(user2, 125, ['b', 'e']);
cons.add(user2, 126, ['d', 'e']);
cons.finalize();
cons.close();
/*
 * Unfiltered
 */
var tdb = new TrailDB({
  path: __dirname + '/test.tdb'
});
for (var trail of tdb.trails()) {
  var trailUuid = trail.getUuid();
  for (var event of trail.events({ toMap: true })) {
    console.log(trailUuid, event.timestamp, JSON.stringify(event.map));
  }
}
/*
 * Using TDB Filters
 *
 * Where `filters` is an array comprised of each `filter` object below:
 *
 * filter.field = {String} field name (mandatory)
 * filter.value = {String} field value (mandatory, can be empty string)
 * filter.neg = {Boolean} negative logic flag
 * filter.and = {Boolean} is this filter a new clause (AND) or part of the
 * previous clause (OR). Disregarded on the first filter statement.
 */
for (var trail of tdb.trails()) {
  var trailUuid = trail.getUuid();
  // This filter reads, "( field1 == 'b' && field2 == 'e' )"
  var filters = [
    {
      field: 'field1',
      val: 'b',
      neg: false,
      and: false // this is disregarded for the first filter element
    },
    {
      field: 'field2',
      val: 'e',
      neg: false,
      and: true // Join to previous filter with a new 'and' clause
    }
  ];
  for (var event of trail.events({ toMap: true, filter: filters })) {
    console.log(trailUuid, event.timestamp, JSON.stringify(event.map));
  }
}
```

*Output (unfiltered):*

```
771799eb-6a0d-4555-9917-0a5d449b35ab 123 {"field1":"a","field2":""}
771799eb-6a0d-4555-9917-0a5d449b35ab 124 {"field1":"b","field2":"c"}
8ff9b509-84a6-4888-8215-e66d7aefd1bc 125 {"field1":"b","field2":"e"}
8ff9b509-84a6-4888-8215-e66d7aefd1bc 126 {"field1":"d","field2":"e"}
```

*Output (filtered):*

```
8ff9b509-84a6-4888-8215-e66d7aefd1bc 125 {"field1":"b","field2":"e"}
```

For more help using TDB filters, checkout (the documentation)[http://traildb.io/docs/api/#filter-events].
