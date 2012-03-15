/* 2001-07-25 (mca) : collection+json */
/* Designing Hypermedia APIs by Mike Amundsen (2011) */

/**
 * Module dependencies.
 */

// for express
var express = require('express');
var app = module.exports = express.createServer();

// for couch
var cradle = require('cradle');
var host = 'https://rybesh.iriscouch.com';
var port = 443;
//var credentials = {username: 'xxx', password: 'xxx' };
var local=false;
var db;
if(local===true) {
  db = new(cradle.Connection)().database('microblog');
}
else {
  db = new(cradle.Connection)(host, port).database('microblog');
}

// global data
var contentType = 'text/html';
var baseUrl = '/microblog/';

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

/* validate user (from  db) via HTTP Basic Auth */
function validateUser(req, res, next) {

  var parts, auth, scheme, credentials; 
  var view, options;
  
  // handle auth stuff
  auth = req.headers["authorization"];
  if (!auth){
    return authRequired(res, 'Microblog');
  }  
  
  parts = auth.split(' ');
  scheme = parts[0];
  credentials = new Buffer(parts[1], 'base64').toString().split(':');
  
  if ('Basic' != scheme) {
    return badRequest(res);
  } 
  req.credentials = credentials;

  // ok, let's look this user up
  view = 'microblog/users_by_id';
  
  options = {};
  options.descending='true';
  options.key=req.credentials[0];
  
  db.view(view, options, function(err, doc) {
    try {
      if(doc[0].value.password===req.credentials[1]) {
        next(req,res);
      }
      else {
        throw new Error('Invalid User');
      } 
    }
    catch (ex) {
      return authRequired(res, 'Microblog');
    }
  });
}

// Routes

/* starting page */
app.get('/microblog/', function(req, res){

  var ctype;
  
  var view = 'microblog/posts_all';
  
  var options = {};
  options.descending = 'true';

  ctype = acceptsXml(req);
  
  db.view(view, options, function(err, doc) {
    res.header('content-type',ctype);
    res.render('index', {
      title: 'Home',
      site: baseUrl,
      items: doc
    });  
  });
});

/* single message page */
app.get('/microblog/messages/:i', function(req, res){

  var view, options, id, ctype;
  id = req.params.i;
  
  view = 'microblog/posts_by_id';
  options = {};
  options.descending='true';
  options.key=id;

  ctype = acceptsXml(req);
  
  db.view(view, options, function(err, doc) {
    res.header('content-type',ctype);
    res.render('message', {
      title: id,
      site: baseUrl,
      items: doc
    });  
  });
});

// add a message
app.post('/microblog/messages/', function(req, res) {
  
  validateUser(req, res, function(req,res) {
  
    var text, item;
    
    // get data array
    text = req.body.message;
    if(text!=='') {
      item = {};
      item.type='post';
      item.text = text;
      item.user = req.credentials[0];
      item.dateCreated = now();
      
      // write to DB
      db.save(item, function(err, doc) {
        if(err) {
          res.status=400;
          res.send(err);
        }
        else {
          res.redirect('/microblog/', 302);
        }
      });  
    }
    else {
      return badReqest(res);
    }
  });
});

/* single user profile page */
app.get('/microblog/users/:i', function(req, res){

  var view, options, id, ctype;
  id = req.params.i;
  ctype = acceptsXml(req);
    
  view = 'microblog/users_by_id';
  options = {};
  options.descending='true';
  options.key=id;
  
  db.view(view, options, function(err, doc) {
    res.header('content-type',ctype);
    res.render('user', {
      title: id,
      site: baseUrl,
      items: doc
    });  
  });
});

/* user messages page */
app.get('/microblog/user-messages/:i', function(req, res){

  var view, options, id, ctype;
 
  id = req.params.i;
  ctype = acceptsXml(req);
  
  view = 'microblog/posts_by_user';
  options = {};
  options.descending='true';
  options.key=id;
  
  db.view(view, options, function(err, doc) {
    res.header('content-type',ctype);
    res.render('user-messages', {
      title: id,
      site: baseUrl,
      items: doc
    });  
  });
});

/* get user list page */
app.get('/microblog/users/', function(req, res){
  var ctype;
  
  var view = 'microblog/users_by_id';
  
  ctype = acceptsXml(req);
    
  db.view(view, function(err, doc) {
    res.header('content-type',ctype);
    res.render('users', {
      title: 'User List',
      site: baseUrl,
      items: doc
    });  
  });
});

/* post to user list page */
app.post('/microblog/users/', function(req, res) {

  var item,id; 

  id = req.body.user;
  if(id==='') {
    res.status=400;
    res.send('missing user');  
  }
  else {
    item = {};
    item.type='user';
    item.password = req.body.password;
    item.name = req.body.name;
    item.email = req.body.email;
    item.description = req.body.description;
    item.imageUrl = req.body.avatar;
    item.websiteUrl = req.body.website;
    item.dateCreated = today();
    
    // write to DB
    db.save(req.body.user, item, function(err, doc) {
      if(err) {
        res.status=400;
        res.send(err);
      }
      else {
        res.redirect('/microblog/users/', 302);
      }
    });    
  }
});

/* get user register page */
app.get('/microblog/register/', function(req, res){

  var ctype;
  ctype = acceptsXml(req);

  res.header('content-type',ctype);
  res.render('register', {
    title: 'Register',
    site: baseUrl
  });
});

/* support various content-types from clients */
function acceptsXml(req) {
  var ctype = contentType;
  var acc = req.headers["accept"];
  
  switch(acc) {
    case "text/xml":
      ctype = "text/xml";
      break;
    case "application/xml":
      ctype = "application/xml";
      break;
    case "application/xhtml+xml":
      ctype = "application/xhtml+xml";
      break;
    default:
      ctype = contentType;
      break;
  }
  return ctype;
}

/* compute the current date/time as a simple date */
function today() {

  var y, m, d, dt;
  
  dt = new Date();

  y = String(dt.getFullYear());
  
  m = String(dt.getMonth()+1);
  if(m.length===1) {
    m = '0'+m;
  }

  d = String(dt.getDate());
  if(d.length===1) {
    d = '0'+d.toString();
  }

  return y+'-'+m+'-'+d;
}

/* compute the current date/time */
function now() {
  var y, m, d, h, i, s, dt;
  
  dt = new Date();
  
  y = String(dt.getFullYear());
  
  m = String(dt.getMonth()+1);
  if(m.length===1) {
    m = '0'+m;
  }

  d = String(dt.getDate());
  if(d.length===1) {
    d = '0'+d.toString();
  }
  
  h = String(dt.getHours()+1);
  if(h.length===1) {
    h = '0'+h;
  }
  
  i = String(dt.getMinutes()+1);
  if(i.length===1) {
    i = '0'+i;
  }
  
  s = String(dt.getSeconds()+1);
  if(s.length===1) {
    s = '0'+s;
  }
  return y+'-'+m+'-'+d+' '+h+':'+i+':'+s;
}

/* return standard 403 response */
function forbidden(res) {

  var body = 'Forbidden';

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Length', body.length);
  res.statusCode = 403;
  res.end(body);
}

/* return standard 'auth required' response */
function authRequired(res,realm) {
  var r = (realm||'Authentication Required');
  res.statusCode = 401;
  res.setHeader('WWW-Authenticate', 'Basic realm="' + r + '"');
  res.end('Unauthorized');
}

/* return standard 'bad inputs' response */
function badRequest(res) {
  res.statusCode = 400;
  res.end('Bad Request');
}

// Only listen on $ node app.js
if (!module.parent) {
  app.listen(process.env.PORT);
  console.log("Express server listening on port %d", app.address().port);
}
