#!/usr/bin/env node
"use strict";

// NOTE: The only thing this file does is start the public facing server and load any installed providers 

// increase the libuv threadpool size to 1.5x the number of logical CPUs.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || Math.ceil(Math.max(4, require('os').cpus().length * 1.5));

var cors = require("cors"),
    cluster = require('cluster'),
    git = require('git-rev'),
    express = require("express"),
    config = require("config"),
    fs = require('fs'),
    bodyParser = require('body-parser'),
    responseTime = require("response-time"),
    koop = require('koop-server')(config);

if (cluster.isMaster) {

    var cpuCount = parseInt( config.processes ) || require('os').cpus().length;
    for (var i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

} else {

  // Scan package for koop providers and register them with koop-server
  var files = fs.readdirSync('node_modules');
  files.forEach(function(f){
    if ( f.match(/koop-*.+/) ){
      try { koop.register(require(f)); } catch (e) { console.log('Error', e, f)}
    }
  });

  var app = express();
  
  app.disable("x-powered-by");
  app.use(responseTime());
  app.use(cors());
  
  app.post('/arcgis/rest/info', function(req, res){
    res.send({},200);
  });

  // reply to /status  
  app.get("/status", function(req, res, next) {
    git.long(function (str) {
      res.json({"koop":str, "koop-server": koop.status});
    })
  });

  app.set('view engine', 'ejs');
  app.set('view options', {layout: 'layout.ejs'});
  
  if (process.env.NODE_ENV === "development") {
    app.use(express.logger());
  }
  
  // handle POST requests 
  app.use(bodyParser());
  
  app.use(express.static(__dirname + '/public'));
  
  // add koop middleware
  app.use( koop );
 
  app.listen(process.env.PORT || config.server.port,  function() {
    console.log("Listening at http://%s:%d/", this.address().address, this.address().port);
  });

}

// catch failing cluster instances 
cluster.on('exit', function (worker) {
  console.log('Worker died', worker.id);
  cluster.fork();
});
