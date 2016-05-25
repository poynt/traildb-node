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
cons.add(user2, 125, ['d', 'e']);
cons.finalize();
cons.close();

var tdb = new TrailDB({
  path: __dirname + '/test.tdb'
});
for (var trail of tdb.trails()) {
  var trailUuid = trail.getUuid();
  for (var event of trail.events({ toMap: true })) {
    console.log(trailUuid, event.timestamp, JSON.stringify(event.map));
  }
}

```

*Output:*

```
771799eb-6a0d-4555-9917-0a5d449b35ab 123 {"field1":"a","field2":""}
771799eb-6a0d-4555-9917-0a5d449b35ab 124 {"field1":"b","field2":"c"}
8ff9b509-84a6-4888-8215-e66d7aefd1bc 125 {"field1":"d","field2":"e"}
```
