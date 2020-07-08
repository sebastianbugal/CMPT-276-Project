const express = require('express')
const path = require('path')
const session = require('express-session')
const PORT = process.env.PORT || 1026
const { Pool } = require('pg');
const db = new Pool({
	// connectionString: process.env.DATABASE_URL || 'postgres://postgres:root@localhost:5432'
	connectionString: process.env.DATABASE_URL||'postgres://postgres:root@localhost:5432'
})

var bodyParser = require('body-parser');

// const { Pool } = require('pg');
// userDB = new Pool({
//   connectionString: process.env.DATABASE_URL
// });

const app = express();

app.use(session ({
  secret: 'splatsplatsplat',
  resave: false,
  saveUninitialized: false
}))
app.use(express.json())
app.use(express.urlencoded({extended:false}))
app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

app.get('/', (req, res) => res.render('pages/login'))
app.get('/login', (req, res) => res.render('pages/login'))

// catalog
var refresh_catalog = (req, res) => {
	let threadQuery = `SELECT * FROM Posts  WHERE p_thread_id = -1 ORDER BY p_post_id DESC`;
	db.query(threadQuery, (error, result) => {
		if(error){ res.send(error); return; }
		let data = {'rows':result.rows};
		res.render('pages/catalog.ejs', data);
	});
}
app.all('/catalog', bodyParser.urlencoded({extended:false}), refresh_catalog);

var refresh_catalog_personal = (req, res) => {
	let threadQuery = `SELECT * FROM Posts WHERE (p_username = any((select following from users where username='${req.session.username}')::text[])) AND p_thread_id = -1 ORDER BY p_post_id DESC`;
	db.query(threadQuery, (error, result) => {
		if(error){ res.send(error); return; }
		let data = {'rows':result.rows};
		res.render('pages/userView', data);
	});
}

app.all('/userView', bodyParser.urlencoded({extended:false}), refresh_catalog_personal);

app.get('/userView', (req,res) =>{
  console.log(req.session.loggedin)
  if(req.session.loggedin==true){
    console.log('logged in')
    var results = {'username': req.session.username};
    res.render('pages/userView',results)}
  else{
    res.render('pages/noAccess')
  }
  })
app.get('/user_add', (req,res)=>{
  res.render('pages/search')
})

app.post('/add_user', (req,res)=>{
  var searchVal=req.body.searchVal;
  query=`select username from users where username='${searchVal}'`
  db.query(query, (err,result) => {
    console.log(result)
    if(result.rowCount>=1){
      update=`UPDATE users SET following=array_append(following, '${searchVal}') where username='${req.session.username}' AND NOT ('${searchVal}'=any(following))`;
      db.query(update,(err,result)=>{
        if(err){
          console.log(err)
          res.redirect('/userView')
        }
        else{
          console.log(result)
          res.redirect('/userView')
        }
      });
    }
    else{
      console.log('nothing found')
      res.redirect('/userView')
    }
  })
})

app.post('/feed', (req,res)=>{

});

app.post('/add-thread', bodyParser.urlencoded({extended:false}), (req, res)=>{
	let data = {};
	// first, fetch the values needed for the thread table
	let tSubject = req.body.tSubject;
	if(!tSubject){tSubject = ""};
  let pUsername = req.session.username;
	let pText = req.body.pText;
	if(!pText)
		res.send("empty post");

	const query = `SELECT "post_thread"('${tSubject}', '${pUsername}', '${pText}') AS id`;

	db.query(query, (error, result) => {
		if(error){ res.send(error); return; }
		res.redirect('/thread/' + result.rows[0].id);
	});
});

app.get('/thread/:id', (req,res)=>{
	let data = {};
	let id = req.params.id;
	const query = `SELECT * FROM Posts p WHERE p.p_thread_id = ${id} OR p.p_post_id = ${id} ORDER BY p.p_post_id;`;
	db.query(query, (error, result) => {
		if(error){ res.send(error); return; }
		data['posts'] =  result.rows;
		//console.log(result.rows);
		res.render('pages/thread.ejs', data);
	});
});
app.post('/add-post/', bodyParser.urlencoded({extended:false}), (req, res) =>{
	let data = {};
	let pThreadId = req.body.pThreadId;
  let pUsername = req.session.username;
  console.log(pUsername)
	let pText = req.body.pText;
	const query = `INSERT INTO Posts(p_thread_id, p_username, p_text) VALUES(${pThreadId}, '${pUsername}', '${pText}')`;
	console.log(query);
	db.query(query, (error, result) => {
		if(error){ res.send(error); return; }
		res.redirect('/thread/'+pThreadId);
	});
});

app.post('/loginForm', (req, res) => {
    var query = `SELECT * FROM users WHERE username = '${req.body.username}' AND password = '${req.body.password}'`;
    db.query(query, (err,result) => {
      if(result.rowCount > 0) {
        req.session.loggedin = true;
        req.session.username = req.body.username;
        var results = {'username': req.session.username};
        console.log(results)
        res.redirect('userView');
      } else {
        return res.render('pages/loginFailed');
      }
      res.end();
    })
  })

app.post('/back-forum', (req,res)=>{
  console.log('redirect to catalog')
  res.redirect('/catalog')
})

//If email is not provided I just put an empty string into database. Set the chess elo default to 1000.
app.post('/registerForm', (req, res) => {
    db.query(`SELECT username from users WHERE username = '${req.body.username}'`, (err, result) => {
      if (result.rowCount > 0) {
        return res.render('pages/usernameTaken');
      } else {
        if(req.body.email){
          var email = req.body.email;
        } else {
          var email = '';
        }
		var query = `INSERT into users (user_id, username, email, chess_elo, password, admin) VALUES(DEFAULT, '${req.body.username}', '${email}',
          '1000', '${req.body.password}', 'false')`;
        db.query(query, (err,result) => {
          if(result) {
            console.log("Successful registration.");
            res.redirect('/login');
          } else if (err){
            res.render('pages/userNameTaken');
          } else {
            res.send("This register has failed idk why.");
          }
          return;
        })
      }
    })
})

app.get('/logout',function(req,res){
    req.session.destroy((err) => {
        if(err){
            console.log("Error has occured");
        } else {
            res.redirect('/login');
        }
    });

});

app.listen(PORT, () => console.log(`Listening on ${ PORT }`))
