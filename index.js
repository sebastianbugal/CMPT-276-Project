const express = require( "express" ),
	http = require( "http" );
const path = require( "path" );
const ses = require( "express-session" );

var cors= require('cors')
// const http=require('http').Server(express);
const { Chess } = require( "./public/js/chess.js" );
const PORT = process.env.PORT || 1200;
const { Pool } = require( "pg" );
var rooms=[];
const glicko=require( "glicko2" );
var settings = {
	tau : 0.5,
	rating : 1500,
	rd : 200,
	vol : 0.06
};
var ranking = new glicko.Glicko2( settings );
const db = new Pool( {
	//connectionString: process.env.DATABASE_URL || 'postgres://postgres:root@localhost:5432'
  connectionString: process.env.DATABASE_URL||"postgres://postgres:root@localhost"

} );
const fetch = require( "node-fetch" );

var bodyParser = require( "body-parser" );

var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var transporter = nodemailer.createTransport(smtpTransport({
  service: 'gmail',
	host: 'smtp.gmail.com',
  auth: {
    user: 'splatwebservices@gmail.com',
    pass: '276RedHorse!!!Donkey'
  }
}));
var crypto = require('crypto');
var format = require('biguint-format');
var validator = require("email-validator");

const app = express();
var server = http.createServer( app );
const io = require( "socket.io", )(server, {'pingTimeout': 180000})
var session=ses ( {

	secret: "splatsplatsplat",
	resave: false,
	saveUninitialized: true
} );

app.use( session );
io.use( function ( socket, next ) {
	session( socket.request, socket.request.res, next );
} );

// const sharedsession = require("express-socket.io-session");
app.use( express.json() );
app.use( express.urlencoded( { extended:false } ) );
app.use("/", cors());
app.use( express.static( path.join( __dirname, "public" ) ) );
app.use( function ( req, res, next ) {
	res.locals.session = req.session;   // session available in ejs
	next();
} );
app.set( "views", path.join( __dirname, "views" ) );
app.set( "view engine", "ejs" );

const Twitter = require( "twitter" );
if ( process.env.NODE_ENV !== "production" ) {
	require( "dotenv" ).config();
}

var t_client = new Twitter( {
	consumer_key: process.env.TWITTER_API_KEY,
	consumer_secret: process.env.TWITTER_API_SECRET_KEY,
	bearer_token: process.env.TWITTER_BEARER_TOKEN
} );

app.get( "/leaderBoards", ( req, res ) => {   // will get rate limited if more than 450 refreshes every 15 mins
	if( req.session.loggedin ){
		t_client.get( "https://api.twitter.com/1.1/search/tweets.json", { q: "#SplatForum", result_type: 'recent'}, function( error, tweets, response ) {
      if( error ) throw error;
      var tweets = { "statuses":tweets.statuses };
      // console.log(tweets);
			var query = "SELECT * FROM users ORDER BY chess_elo DESC";
			db.query( query, ( err, result ) => {
				if( err ){
					res.send( error );
        }
        var data = { "rows":result.rows, tweets };
        res.render( "pages/leaderBoards", data );
			} );
		} );
	} else {
		res.redirect( "login" );
	}
} );


app.get("/tweetAuth", (req, res) => {
  // get request token
  t_client.post("https://api.twitter.com/oauth/request_token", {oauth_callback:"https://splatt.herokuapp.com/tweetAuthed", oauth_consumer_key:process.env.TWITTER_API_KEY }, function(error, response) {
    if (error) {
      // console.log("error");
    }
    var token = response.split('&')[0];
    res.redirect(`https://api.twitter.com/oauth/authorize?${token}`);
  } );

});

app.get("/tweetAuthed", (req, res) => {
  var tokens = req.originalUrl.split('&');
  tokens[0] = tokens[0].split('?')[1];
  if (tokens[0].substring(0,6) == 'denied') {
    res.redirect("/leaderBoards");
    return;
  } else {
    tokens[0] = tokens[0].split('=')[1];
    tokens[1] = tokens[1].split('=')[1];
  }

  t_client.post("https://api.twitter.com/oauth/access_token", {oauth_consumer_key:process.env.TWITTER_API_KEY, oauth_token:tokens[0], oauth_verifier:tokens[1]}, function(error, response) {
    console.log(response);
    response = response.split('&');
    var access_tokens = {oauth_token: response[0].split('=')[1],
                         oauth_token_secret: response[1].split('=')[1]};
    db.query(`UPDATE Users SET oauth_token='${access_tokens.oauth_token}', oauth_token_secret='${access_tokens.oauth_token_secret}' WHERE username='${req.session.username}'`, ( err, result ) => {
      if( err ){
        console.log(err);
        res.send(err);
      }
      var t_client_u = new Twitter( {
        consumer_key: process.env.TWITTER_API_KEY,
        consumer_secret: process.env.TWITTER_API_SECRET_KEY,
        access_token_key: access_tokens.oauth_token,
        access_token_secret: access_tokens.oauth_token_secret
      });
      var query = `SELECT * FROM users WHERE username='${req.session.username}' ORDER BY chess_elo DESC`;
			db.query( query, ( err, result ) => {
				if( err ){
					res.send( error );
        }
        var data = result.rows[0];
        var t_status = `Username:${data.username}, Wins:${data.wins}, Ties:${data.ties}, Losses:${data.losses}, Elo:${data.chess_elo}   #SplatForum`;
        t_client_u.post('statuses/update', {status: t_status}, function(error, tweet, response) {
          if (error) {
            console.log(error);
          }
          console.log("Tweet Sent!");
          res.redirect('/leaderBoards');
      });
      });
    });
  });
});


app.get( "/", ( req, res ) => res.render( "pages/login" ) );

app.get( "/login", ( req, res ) => res.render( "pages/login" ) );

app.get( "/forgot", ( req, res ) => res.render( "pages/forgot" ) );

app.get( "/emailTaken", ( req, res ) => res.render( "pages/emailTaken" ) );

app.all( "/admin", ( req, res ) => {
	// check for admin rights
	if( req.session.loggedin ) {
		if( req.session.role == "m" || req.session.role == "a" ) {
			let data = {};
			data["results"] = -1;
			const query = "SELECT * FROM Reports r, Posts p WHERE r.r_post_id = p.p_post_id ORDER BY r.r_report_id ASC";
			db.query( query, ( error, result ) => {
				if( error ){res.send( error ); return;}
				data["reports"] =  result.rows;
				res.render( "pages/adminDashboard", data );
			} );
		}
		else {
			res.send( "Access Denied" );
		}
	}
	else {
		return res.redirect( "login" );
	}
} );

app.get( "/chat",( req,res )=>{
	if( req.session.loggedin ){
		res.render( "/userView" );}
	else{
		res.redirect( "login" );
	}
} );
// Catalog will now only show posts where the user is within the accessible forum
var refresh_catalog = ( req, res ) => {
	if( req.session.loggedin ){
  	let threadQuery = `SELECT * FROM Posts  WHERE p_thread_id = -1
  	AND (t_forum = any((select accessible from users where username='${req.session.username}')::text[]))
    AND NOT (p_username = any((select blocked from users where username='${req.session.username}')::text[])) ORDER BY p_post_id DESC`;
  	db.query( threadQuery, ( error, result ) => {
  		if( error ){ res.send( error ); return; }
  		let data = { "rows":result.rows };
  		if( req.session.loggedin )
  			data["username"] = req.session.username;
  		else
  			data["username"] = "";
  		console.log( result.rows );
			query2=`SELECT accessible FROM users WHERE username='${req.session.username}'`;
			db.query( query2, ( err,resultA ) => {
				if( err ){
					console.log( err );
					res.redirect( "/" );
				}
				else{
					console.log( resultA.rows[0].accessible );
					data["forums"]=resultA.rows[0].accessible;
					res.render( "pages/catalog.ejs", data );
				}
			} );
  	} );
	} else {
		res.redirect( "login" );
	}
};
app.all( "/catalog", bodyParser.urlencoded( { extended:false } ), refresh_catalog );

var refresh_catalog_personal = ( req, res ) => {
	if( req.session.loggedin ){
  	let threadQuery = `SELECT * FROM Posts WHERE (p_username = any((select following from users where username='${req.session.username}')::text[]))
  	AND p_thread_id = -1 AND (t_forum = any((select accessible from users where username='${req.session.username}')::text[])) ORDER BY p_post_id DESC`;
  	db.query( threadQuery, ( error, result ) => {
  		if( error ){ res.send( error ); return; }
  		let data = { "rows":result.rows };
  		res.render( "pages/userView", data );
  	} );
	} else {
		res.redirect( "login" );
	}
};

app.all( "/userView", bodyParser.urlencoded( { extended:false } ), refresh_catalog_personal );

app.get( "/userView", ( req,res ) =>{
	console.log( req.session.loggedin );
	if( req.session.loggedin==true ){
		console.log( "logged in" );
		var results = { "username": req.session.username };
		res.render( "pages/userView",results );}
	else{
		res.redirect( "login" );
	}
} );
app.get( "/user_add", ( req,res )=>{
	if( req.session.loggedin ){
		query=`SELECT following FROM users WHERE username='${req.session.username}'`;
		db.query( query, ( err,result ) => {
			if( err ){
				console.log( err );
				res.redirect( "/" );
			}
			else{
				console.log( result.rows[0].following );
				fol=result.rows[0].following;
				query=`SELECT blocked FROM users WHERE username='${req.session.username}'`;
				db.query( query, ( err,result ) => {
					if( err ){
						console.log( err );
						res.redirect( "/" );
					}
					else{
						console.log( result.rows[0].blocked );
						block=result.rows[0].blocked;
						res.render( "pages/search",[ fol,block ] );
					}
				} );
			}
		} );
	}
	else{
		res.redirect( "login" );
	}
} );

app.post( "/add_user", ( req,res )=>{
	var searchVal=req.body.searchVal;
	query=`select username from users where username='${searchVal}'`;
	db.query( query, ( err,result ) => {
		console.log( result );
		if( result.rowCount>=1 ){
			update=`UPDATE users SET following=array_append(following, '${searchVal}') where username='${req.session.username}' AND NOT ('${searchVal}'=any(following))`;
			db.query( update,( err,result )=>{
				if( err ){
					console.log( err );
					res.redirect( "/userView" );
				}
				else{
					console.log( result );
					res.redirect( "/userView" );
				}
			} );
		}
		else{
			console.log( "nothing found" );
			res.redirect( "/userView" );
		}
	} );
} );

app.post( "/unfollow", ( req,res )=>{
	unfollow=req.body.unfollow;
	update=`UPDATE users SET following=array_remove(following, '${unfollow}') where username='${req.session.username}'`;
	db.query( update, ( error, result ) => {
		if( error ){
			console.log( error );
			res.redirect( "/userView" );
		}
		else{
			console.log( result );
			res.redirect( "/userView" );
		}
	} );

	console.log( unfollow );
} );

app.post( "/block_user", ( req,res )=>{
	var searchVal=req.body.searchVal;
	query=`select username from users where username='${searchVal}'`;
	db.query( query, ( err,result ) => {
		console.log( result );
		if( result.rowCount>=1 ){
			update=`UPDATE users SET blocked=array_append(blocked, '${searchVal}') where username='${req.session.username}' AND NOT ('${searchVal}'=any(blocked))`;
			db.query( update,( err,result )=>{
				if( err ){
					console.log( err );
					res.redirect( "/userView" );
				}
				else{
					console.log( result );
					res.redirect( "/userView" );
				}
			} );
		}
		else{
			console.log( "nothing found" );
			res.redirect( "/userView" );
		}
	} );
} );

app.post( "/unblock", ( req,res )=>{
	var unblock=req.body.unblock;
	update=`UPDATE users SET blocked=array_remove(blocked, '${unblock}') where username='${req.session.username}'`;
	db.query( update, ( error, result ) => {
		if( error ){
			console.log( error );
			res.redirect( "/userView" );
		}
		else{
			console.log( result );
			res.redirect( "/userView" );
		}
	} );

	console.log( unblock );
} );

app.post( "/feed", ( req,res )=>{

} );

//Create forum with password. Admin users gain access to all things.
app.post( "/create_forum", ( req,res )=> {
	var forumName = req.body.forumName;
	var forumPassword = req.body.forumPassword;
	var owner = req.session.username;
	db.query( `SELECT f_name from forums WHERE f_name = '${forumName}'`, ( err, result ) => {
		if ( result.rowCount > 0 ) {
			return res.send( `Forum name '${forumName}' already taken, contact forum owner '${owner}' to be allowed access.` );
		} else {
			const query = `INSERT INTO Forums(f_name, f_password, f_owner) VALUES ('${forumName}', '${forumPassword}', '${owner}')`;
			db.query( query, ( err, result ) => {
				if( err ){res.send( err ); return; }
				var update=`UPDATE users SET accessible=array_append(accessible, '${req.body.forumName}') where (username='${req.session.username}' OR role = 'a') AND NOT ('${req.body.forumName}'=any(accessible))`;
				db.query( update,( err,result )=>{
					console.log( result );
					if( err ){
						res.send( err );
					}
					else{
						res.redirect( "/catalog" );
					}
				} );
			} );
		}
	} );
} );

//Need password to access a forum. Might eventually add invites as well through direct messages?
app.post( "/access_forum", ( req,res )=> {
	var query = `SELECT * FROM Forums WHERE f_name = '${req.body.forumName}' AND f_password = '${req.body.forumPassword}'`;
	db.query( query, ( err,result ) => {
		if( result.rowCount > 0 ) {
			update=`UPDATE users SET accessible=array_append(accessible, '${req.body.forumName}') where username='${req.session.username}' AND NOT ('${req.body.forumName}'=any(accessible))`;
			db.query( update,( err,result )=>{
				console.log( result );
				if( err ){
					res.send( "Cannot access this forum, you may already be able to access it" );
				}
				else{
					console.log( result );
					res.redirect( "/catalog" );
				}
			} );
		}
		else{
			return res.send( "Incorrect forum name or password" );
		}
	} );
} );

app.get( "/rules", ( req,res )=>{
	res.render( "pages/rules.ejs" );
} );

app.post( "/add-thread", bodyParser.urlencoded( { extended:false } ), ( req, res )=>{
	if( !req.body["g-recaptcha-response"] ){
		res.send( "captcha not filled, placeholder response, ajax resposne coming" );
		return;
	}
	if( req.session.loggedin==false ){ res.render( "pages/noAccess.ejs" ); return; }
	let data = {};
	// first, fetch the values needed for the thread table
	let tSubject = req.body.tSubject;
	if( !tSubject ){tSubject = "";}
	let tForum = req.body.tForum;
	if( !tForum ){tForum = "main";}
	let pUsername = req.session.username;
	let pText = req.body.pText;
	if( !pText )
		res.send( "empty post" );
  //get ip
  let ipApiData = {};
  ipApiData["countryCode"] = "AX";
  let ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  if ( ip.substr( 0, 7 ) == "::ffff:" ) {
    ip = ip.substr( 7 );
  }
  console.log( "ip: " + ip );
  const ipApiUrl = `http://ip-api.com/json/${ip}?fields=countryCode`;
  fetch( ipApiUrl )
    .then( ( res ) => res.json() )
    .then( ( json ) => {
      if( json["countryCode"] )
        ipApiData["countryCode"] = json["countryCode"];
      console.log( "fetched countryCode= " + json["countryCode"] );
      console.log( ipApiUrl );
    } );
  console.log( "countryCode: " + ipApiData["countryCode"] );


	db.query( `SELECT * FROM Users WHERE username = '${pUsername}' AND ('${tForum}' = any(accessible))`, ( error, result ) => {
		if( error ){ res.send( error ); return; }
		//Checks to see if the User can access the forum they are posting to.
		if( result.rowCount > 0 ) {
			const query = `SELECT "post_thread"('${tSubject}', '${tForum}', '${pUsername}', '${pText}', '${ipApiData["countryCode"]}') AS id`;
			db.query( query, ( error, result ) => {
				if( error ){ res.send( error ); return; }
				res.redirect( "/thread/" + result.rows[0].id );
			} );
		} else {
			res.redirect( "/catalog/" );
		}
	} );
} );

app.get( "/thread/:id", ( req,res )=>{
	if( req.session.loggedin ){
		let data = {};
		let id = req.params.id;
		const query = `SELECT * FROM Posts p LEFT JOIN Replies r ON r.parent_id = p.p_post_id WHERE p.p_thread_id = ${id} OR (p.p_thread_id = -1 AND p.p_post_id = ${id}) ORDER BY p.p_post_id ASC, r.reply_id ASC`;
		const blockedQ = `SELECT blocked FROM users WHERE username='${req.session.username}'`;
		db.query( blockedQ, ( err, resultB ) => {
			if( err ){
				console.log( err );
				res.redirect( "/" );
			} else {
				console.log( resultB.rows[0].blocked );
				data["block"]=resultB.rows[0].blocked;
				db.query( query, ( error, result ) => {
					if( error ){ res.send( error ); return; }
					data["posts"] =  result.rows;
					data["username"] = "";
					if( req.session.loggedin == true ){
						data["username"] = req.session.username;
						data["role"] = req.session.role;
					}
					console.log( result.rows );
					res.render( "pages/thread.ejs",data );
				} );
			}
		} );
	} else {
		res.redirect( "/login" );
	}
} );


app.get( "/report-post/:id", ( req, res )=>{
	let data = {};
	data["p_post_id"] = req.params.id;

	res.render( "pages/reportPost.ejs", data );
} );

app.post( "/send-report", bodyParser.urlencoded( { extended:false } ), ( req, res )=>{
	if( req.session.loggedin==false ){ res.render( "pages/noAccess.ejs" ); return; }
	if( !req.body["g-recaptcha-response"] ){
		res.send( "captcha not filled, placeholder response, ajax resposne coming" );
		return;
	}
	let data = {};
	data["pPostId"] = req.body.rPostId;
	let rRule = req.body.rRule;
	if( req.body.reason == "law" ){
		rRule = req.body.reason;
	}
	let rPostId = req.body.rPostId;
	let rUsername = req.session.username;
	data["p_post_id"] = req.params.id;
	const query = `INSERT INTO Reports(r_rule, r_post_id, r_username) VALUES('${rRule}', '${rPostId}', '${rUsername}')`;
	console.log( query );
	db.query( query, ( error, result ) => {
		if( error ){res.send( error ); return;}
	} );

	res.render( "pages/reportSent.ejs", data );
} );

app.post( "/add-post/", bodyParser.urlencoded( { extended:false } ), ( req, res ) =>{
	function post_query( pThreadId, pUsername, pText, pCountryCode ){
		return new Promise( resolve => {
			const query = `SELECT "post_reply"(${pThreadId}, '${pUsername}', '${pText}', '${pCountryCode}') AS id`;
			console.log( query );
			db.query( query, ( error, result ) => {
				if( error ){ res.send( error ); return; }
				console.log( "THIS: " + result.rows[0].id );
				resolve( result.rows[0].id );
			} );
		} );
	}

	async function reply_query( pThreadId, pUsername, pText, pCountryCode ){
		let pPostId = await post_query( pThreadId, pUsername, pText, pCountryCode );
		const replyRegex = />>[0-9]+/g;
		const replyingTo = pText.match( replyRegex );
		let replyingToSet = new Set( replyingTo );
		let replyQuery = "INSERT INTO Replies(parent_id, reply_id) VALUES($1, $2)";
		replyingToSet.forEach( ( parentId ) => {
			console.log( "REPLYING TO:" + parentId.slice( 2 ) + " FROM:" + pPostId );
			db.query( replyQuery, [ parentId.slice( 2 ), pPostId ], ( error, result ) => {
				//if(error){res.send(error); return;}
			} );
		} );
	}

	if( req.session.loggedin==false ){ res.render( "pages/noAccess.ejs" ); return; }

	if( !req.body["g-recaptcha-response"] ){
		res.send( "captcha not filled, placeholder response, ajax resposne coming" );
		return;
	}
	let pThreadId = req.body.pThreadId;
	let pUsername = req.session.username;
	let pText = req.body.pText;
	if( !pText ){
		res.send( "empty post" );
		return;
	}

	//get ip
	let ipApiData = {};
	ipApiData["countryCode"] = "AX";
	let ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
	if ( ip.substr( 0, 7 ) == "::ffff:" ) {
		ip = ip.substr( 7 );
	}
	console.log( "ip: " + ip );
	const ipApiUrl = `http://ip-api.com/json/${ip}?fields=countryCode`;
	fetch( ipApiUrl )
		.then( ( res ) => res.json() )
		.then( ( json ) => {
			if( json["countryCode"] )
				ipApiData["countryCode"] = json["countryCode"];
			console.log( "fetched countryCode= " + json["countryCode"] );
			console.log( ipApiUrl );
			reply_query( pThreadId, pUsername, pText, ipApiData["countryCode"] );
		} );
	console.log( "countryCode: " + ipApiData["countryCode"] );

	// regular expression to limit consecutive line breaks to two
	pText = pText.replace( /\n\s*\n\s*\n/g, "\n\n" );
	res.redirect( "/thread/"+pThreadId );
} );

app.post( "/loginForm", ( req, res ) => {
	var query = `SELECT * FROM users WHERE username = '${req.body.username}' AND password = '${req.body.password}'`;
	db.query( query, ( err,result ) => {
    db.query(`SELECT * FROM bans WHERE b_username = '${req.body.username}' AND CURRENT_TIMESTAMP < b_end ORDER BY b_end DESC`, (error2, result2) => {
      if(error2){res.send(error2); return;}
      if(result2.rowCount > 0){
        res.render("pages/banwall.ejs", {'row': result2.rows});
        return;
      } else{
        if( result.rowCount > 0 ) {
          req.session.loggedin = true;
          req.session.username = req.body.username;
          req.session.role = result.rows[0]["role"];
          var results = { "username": req.session.username };
          console.log( results );
          res.redirect("userView");
        } else {
          return res.render( "pages/loginFailed" );
        }
        res.end();
      }
    });
  } );
} );

app.post( "/back-forum", ( req,res )=>{
	console.log( "redirect to catalog" );
	res.redirect( "/catalog" );
} );

//If email is not provided I just put an empty string into database. Set the chess elo default to 1000.
app.post( "/registerForm", ( req, res ) => {
	db.query( `SELECT username from users WHERE username = '${req.body.username}'`, ( err, result ) => {
		if ( result.rowCount > 0 ) {
			return res.render( "pages/usernameTaken" );
		} else {
			if( req.body.email ){
				db.query( `SELECT email from users WHERE email = '${req.body.email}'`, ( err, result ) => {
					if ( result.rowCount > 0 ) {
						res.redirect("/emailTaken");
					} else {
						var email = req.body.email;
						var query = `INSERT into users (username, email, password) VALUES('${req.body.username}', '${email}', '${req.body.password}')`;
						db.query( query, ( err,result ) => {
							if( result ) {
                console.log( "Successful registration." );
								res.redirect( "/login" );
							} else if ( err ){
								res.render( "pages/usernameTaken" );
							} else {
								res.send( "This register has failed idk why." );
							}
							return;
						} );
					}
				})
			} else {
				var email = "";
				var query = `INSERT into users (username, email, password) VALUES('${req.body.username}', '${email}', '${req.body.password}')`;
				db.query( query, ( err,result ) => {
					if( result ) {
            console.log( "Successful registration." );
						res.redirect( "/login" );
					} else if ( err ){
						res.render( "pages/usernameTaken" );
					} else {
						res.send( "This register has failed idk why." );
					}
					return;
				} );
			}
		}
	} );
} );

app.post("/reset-email", (req, res) => {
	var userEmail = req.body.email;
	if(validator.validate(userEmail)){
		const query = `SELECT username from users WHERE email = '${userEmail}'`;
		db.query(query, (err, result) => {
			if (result.rowCount > 0) {
				var randy = crypto.randomBytes(6);
				var stringnum = format(randy, 'dec');
				var num = BigInt(stringnum);
				const query2 = `UPDATE users SET resetToken = '${num}' WHERE email = '${userEmail}'`;
				db.query(query2, (err,result) => {
					if(err) {
						console.log("Token not inserted");
						res.redirect("/login");
						return;
					} else {
						var emailToken = {
							from: 'splatwebservices@gmail.com',
							to: `${userEmail}`,
							subject: `Password reset token for Splat`,
							text: `Hello,
You are receiving this email because you or somebody else has requested a password reset on splat. If this was not you, check your security on all your accounts.
If this was you then your password reset token is: ${num}. Enter this on the page that you have been redirected to on Splat.
Thank you for using Splat.
From: The Splat Team.`
						}
						transporter.sendMail(emailToken, function(err, info){
							if (err) {
								console.log(err);
								res.redirect("/login");
								return;
							} else {
								res.render("pages/resetCheck");
								return;
							}
						})
					}
				})
			} else {
				res.render("pages/noAccount");
			}
		})
	} else {
		res.render("pages/emailInvalid.ejs")
	}
});

app.post("/reset-check", (req, res)=> {
	var token = req.body.numericalToken;
	const query = `SELECT username FROM users WHERE resetToken = '${token}'`;
	db.query(query, (err, result) => {
		if(err){
			console.log(err);
		} else if (result.rowCount == 1){
			const query2 = `UPDATE users SET resetToken = NULL WHERE resetToken = ${token}`;
			db.query(query2, (err2,result2) => {
				if(err2){
					console.log(err2);
				} else {
					user = { 'rows': result.rows}
					res.render("pages/resetPassword", user);
				}
			})
		} else {

		}
	})
});

app.post("/reset-password", (req, res)=> {
	var pass1 = req.body.password1;
	var pass2 = req.body.password2;
	var usernameChange = req.body.user;
	if(pass1 == pass2){
		const query = `UPDATE users SET password = '${pass1}' WHERE username = '${usernameChange}'`;
		db.query(query, (err, result) => {
			if(err){
				console.log(err);
			} else {
				res.render("pages/resetPassSuccess");
			}
		});
	} else {
		db.query(`SELECT username FROM users WHERE username = '${usernameChange}'`, (err,result)=> {
			if(err){
				console.log(err);
			} else {
				user = { 'rows': result.rows}
				res.render("pages/resetPassword", user);
			}
		})
	}
});

// admin posts
app.post("/deleteReport", (req, res)=>{
  var id = req.body.id;
  db.query( `DELETE FROM Reports WHERE r_report_id = ${id}`, ( error, result ) => {
    if(error){res.send(error); return;}
    res.redirect("/admin");
  });
});

app.post( "/deletePost", ( req, res )=> {
  var pid = req.body.pid;
  db.query( `SELECT FROM "delete_post"(${pid})`, ( err, result ) => {
    if( err ){
      console.log( "Invalid input" );
      var results = { "results": -2 };
      res.redirect( "/admin" );
      return;
    }
    res.redirect( "/admin" );
  } );
} );


app.post( "/deleteUser", bodyParser.urlencoded( { extended:false } ), ( req, res )=> {
  var username = req.body.username;
  db.query( `SELECT FROM "delete_user"('${username}')`, ( err, result ) => {
    if( err ){
      console.log( "invalid input" );
     }
    res.redirect( "/admin" );
  } );
} );

app.all("/admin/bans", (req, res)=>{
  if( req.session.loggedin && (req.session.role == "m" || req.session.role == "a")) {
    db.query( "SELECT * FROM bans ORDER by b_start", (error,result)=>{
      if(error){res.send(error); return;}
      res.render("pages/bans.ejs", {'bans': result.rows});
    });
  } else{
    res.redirect( "/" );
    return;
  }
});

app.post("/banUser", bodyParser.urlencoded({ extended: false }), (req, res)=>{
  var username = req.body.username;
  var days = req.body.days;
  var rule = req.body.rule;
  var id = req.body.id;
  var post_id = req.body.post_id;
  if(!post_id)
    post_id = -1;

  db.query( `DELETE FROM Reports WHERE r_report_id = ${id}`, ( error, result ) => {
    if(error){res.send(error); return;}
  });

  db.query(`INSERT INTO bans(b_username, b_end, b_rule, b_post_id) VALUES('${username}', CURRENT_DATE + INTERVAL '24 hour' * ${days}, '${rule}', ${post_id})`, (error, result)=>{
      if(error){res.send(error); return;}
      res.redirect("admin");
  });
});

app.post("/admin/deleteBan", bodyParser.urlencoded( { extended:false } ), (req, res)=>{
  var id = req.body.id;
  db.query(`DELETE FROM bans WHERE b_id = ${id}`, (error, result)=>{
    if(error){res.send(error); return;}
    res.redirect("/admin/bans");
  });
});

app.all("/deleteBanExpired", (req, res)=>{
  db.query(`DELETE FROM bans WHERE b_end < CURRENT_TIMESTAMP`, (error, result)=>{
    if(error){res.send(error); return;}
    res.redirect("/admin/bans");
  });
});


app.post( "/updateAdmin", bodyParser.urlencoded( { extended:false } ), ( req, res )=> {
	db.query( `UPDATE Users SET role='${req.body.role}' WHERE username='${req.body.username}'`, ( err, result ) => {
    // mods cannot make others mod/admin
    if(req.session.role != 'a' && (req.body.role == 'a' || req.body.role == 'm')){
      res.send("Insufficient Role Privilidges for elevation.")
      return;
    }
    if( err ){
			res.send( "Invalid input" );
			console.log( "Invalid input" );
			return;
		}
		res.redirect( "/admin" );
	} );
} );

app.all( "/users", ( req,res )=>{
	db.query( "SELECT * FROM users", ( error, result )=>{
		if( error ){ res.send( error ); }
		res.render( "pages/users.ejs", { "users": result.rows } );
	} );
} );


function NumClients( room ) {
	var clients = io.adapter.rooms[room];
	return Object.keys( clients ).length;
}

var chess = new Chess();
var bid;
var wid;
var username_w;
var username_b;
var r=[];

io.on( "connection", socket=>{
	var req = socket.request;
	socket.on( "chat_message", function( message ) {
		socket.username = req.session.username;
		io.emit( "chat_message", "<strong>" + socket.username + "</strong>: " + message );
	} );

	//chatt

	socket.on( "reset",data=>{
		chess=new Chess();
		socket.to( "chess_room" ).emit( "fen",chess.fen() );
		wid=null;
		bid=null;
		username_w=null;
		username_b=null;
	} );
	socket.on( "create_join_room",data=>{
		console.log(req.session.loggedin)
		if(req.session.loggedin!=true){
			socket.emit('room_full')
		}
		else{
		var a = new Chess();
		wid=socket.id;
		var username_w=req.session.username;
		var user_names=[ username_w,username_b ];
		console.log( "sending user" );

		socket.join( data );
		rooms.push( { "room":data , "chess":a, "white_socket":socket.id, "black_socket":null,"white_user":username_w, "black_user":null, "clientnum":1, "forfeit":false, "running":false } );
		r.push( data );
		console.log( rooms[0].white_socket );

		console.log( "sending user" );
		io.to( data ).emit( "user_name",user_names );
		}
	} );
	socket.on( "join_room",data=>{
		if(req.session.loggedin!=true){
			socket.emit('room_full')
		}
		else{
		var cur;
		rooms.forEach( ( r )=>{
			if( r.room==data && r.clientnum<2 ){

				if( r.white_socket==null ){
					r.white_socket=socket.id;
				}
				else if( r.black_socket==null ){
					r.black_socket=socket.id;
				}
				wid=r.white_socket;
				bid=r.black_socket;
				r.black_user=req.session.username;
				r.running=true;
				r.chess.reset()
			}
			r.clientnum++;
			cur=r;

		} );
		if(cur.clientnum>2){
			socket.emit('room_full')
		}
		socket.join( data );
		console.log( "user",socket.id,"joined" );
		console.log( wid,bid );
		var user_names=[ cur.white_user,cur.black_user ];
		var query = `SELECT username, chess_elo, rd, vol FROM users WHERE username='${user_names[0]}' OR username='${user_names[1]}'`;
		db.query( query, ( err, result ) => {
			console.log( result.rows[0].username );
			console.log( err );
			io.in( data ).emit( "user_data", result.rows );
		} );
		console.log( "sending user" );
		io.in( data ).emit( "user_name",user_names );
		console.log( data );
		io.in(data).emit('fen',cur.chess.fen())
	}
	} );
	socket.on( "start",function(){
		console.log( "working" );

	} );

	socket.on( "drag_start",data=>{

		if( chess.game_over() ){
			socket.to( "chess_room" ).emit( "game_over",true );

		}

		if( ( chess.turn()==="w"&& data.search( /^b/ ) !== -1 && wid==socket.id ) ){
			console.log( true );
			socket.to( "chess_room" ).emit( "side",true );
		}
		else{
[]

			socket.to( "chess_room" ).emit( "side",true );
		}
		if( ( chess.turn() === "b" && data.search( /^w/ ) !== -1 && bid==socket.id ) ){
			socket.to( "chess_room" ).emit( "side",true );
			console.log( false );

		}
		else{
			socket.to( "chess_room" ).emit( "side",true );
		}
	} );

	socket.on( "move", data=>{
		var cur;
		console.log( "move made" );
		rooms.forEach( ( r )=>{
			if( data[0]==r.room ){
				cur=r;
				chess=r.chess;
			}
		} );
		if(cur!=null){
		bid=cur.black_socket;
		wid=cur.white_socket;
		console.log( "expected w:",wid, "expected bid:" ,bid );

		var moveColor = "white";

		if ( chess.turn() === "b" && socket.id==bid ){
			console.log( "makes move:",bid );
			moveColor = "black";
			chess.move( data[1] );

		}
		else if( chess.turn() === "w" && socket.id==wid ){
			console.log( "makes move:",wid );
			moveColor = "white";
			chess.move( data[1] );
		}

		rooms.forEach( ( r )=>{
			if( data[0]==r.room ){
				r.chess=chess;
			}
		} );
		var status;
		// checkmate?
		console.log( cur );


		if ( chess.in_checkmate() ) {
			status = "Game over, " + moveColor + " is in checkmate.";
 			var white_player;
			var black_player;
			var match=[];
			console.log( "works here", cur.black_user, cur.white_user );
			var query = `SELECT username, chess_elo, rd, vol FROM users WHERE username='${cur.black_user}' OR username='${cur.white_user}'`;
			console.log( query );
			db.query( query, ( err, result ) => {
				console.log( "sdsdsdsdsd",err, result );
				result.rows.forEach( function( r ){
					console.log( r.username, "this is a test for the for eahc loop" );
					if( r.username==cur.white_user ){
						if( r.rd==null && r.vol==null &&( r.chess_elo==0 || r.chess_elo==null ) ){
							white_player=ranking.makePlayer();
						}
						else{
							white_player=ranking.makePlayer( r.chess_elo, r.rd,r.vol );
						}
					}
					if( r.username==cur.black_user ){
						if( r.rd==null && r.vol==null &&( r.chess_elo==0 || r.chess_elo==null ) ){
							black_player=ranking.makePlayer();
						}
						else{
							black_player=ranking.makePlayer( r.chess_elo, r.rd,r.vol );
						}
					}
				} );
				console.log( black_player, white_player );
				if( moveColor=="white" ){
					console.log( "white" );
					match.push( [ white_player,black_player,1 ] );

					console.log( match );
					ranking.updateRatings( match );

					var query_w = `UPDATE users SET chess_elo=${white_player.getRating()}, rd=${white_player.getRd()}, vol=${white_player.getVol()}, wins=wins+1 WHERE username='${cur.white_user}'`;
					db.query( query_w, ( err, result ) => {console.log( err,result );} );
					var query_b = `UPDATE users SET chess_elo=${black_player.getRating()}, rd=${black_player.getRd()}, vol=${black_player.getVol()}, losses=losses+1 WHERE username='${cur.black_user}'`;
					db.query( query_b, ( err, result ) => {console.log( err,result );} );
				}
				else{
					console.log( "black" );
					match.push( [ white_player,black_player,0 ] );

					console.log( match );
					ranking.updateRatings( match );

					var query_w = `UPDATE users SET chess_elo=${white_player.getRating()}, rd=${white_player.getRd()}, vol=${white_player.getVol()}, losses=losses+1 WHERE username='${cur.white_user}'`;
					db.query( query_w, ( err, result ) => {console.log( err,result );} );
					var query_b = `UPDATE users SET chess_elo=${black_player.getRating()}, rd=${black_player.getRd()}, vol=${black_player.getVol()}, wins=wins+1 WHERE username='${cur.black_user}'`;
					db.query( query_b, ( err, result ) => {console.log( err,result );} );
				}
			} );

			io.in(cur.room).emit('close_room',(moveColor+' Wins'))
			rooms.forEach(function(item, index, object) {
				if (item.room === cur.room) {
				  object.splice(index, 1);
				}
			  });
			  r.forEach(function(item, index, object){
				if (item === cur.room) {
					object.splice(index, 1);
				  }
			  })
			  console.log(rooms, r)
		}

		// draw?
		else if ( chess.in_draw() ) {
			status = "Game over, drawn position";
			var white_player;
			var black_player;
			var match=[];

			console.log( "works here", cur.black_user, cur.white_user );
			var query = `SELECT username, chess_elo, rd, vol FROM users WHERE username='${cur.black_user}' OR username='${cur.white_user}'`;
			console.log( query );
			db.query( query, ( err, result ) => {
				console.log( "sdsdsdsdsd",err, result );
				result.rows.forEach( function( r ){
					console.log( r.username, "this is a test for the for eahc loop" );
					if( r.username==cur.white_user ){
						if( r.rd==null && r.vol==null &&( r.chess_elo==0 || r.chess_elo==null ) ){
							white_player=ranking.makePlayer();
						}
						else{
							white_player=ranking.makePlayer( r.chess_elo, r.rd,r.vol );
						}
					}
					if( r.username==cur.black_user ){
						if( r.rd==null && r.vol==null &&( r.chess_elo==0 || r.chess_elo==null ) ){
							black_player=ranking.makePlayer();
						}
						else{
							black_player=ranking.makePlayer( r.chess_elo, r.rd,r.vol );
						}
					}
				} );
				console.log( black_player, white_player );
				match.push( [ white_player,black_player,0.5 ] );
				console.log( match );
				ranking.updateRatings( match );
				var query_w = `UPDATE users SET chess_elo=${white_player.getRating()}, rd=${white_player.getRd()}, vol=${white_player.getVol()}, ties=ties+1 WHERE username='${cur.white_user}'`;
				db.query( query_w, ( err, result ) => {console.log( err,result );} );
				var query_b = `UPDATE users SET chess_elo=${black_player.getRating()}, rd=${black_player.getRd()}, vol=${black_player.getVol()},ties=ties+1 WHERE username='${cur.black_user}'`;
				db.query( query_b, ( err, result ) => {console.log( err,result );} );
			} );
			io.in(cur.room).emit('close_room','Draw')
			rooms.forEach(function(item, index, object) {
				if (item.room === cur.room) {
				  object.splice(index, 1);
				}
			  });
			  r.forEach(function(item, index, object){
				if (item === cur.room) {
					object.splice(index, 1);
				  }
			  })
			  console.log(rooms, r)
		}

		// game still on
		else {
			status = moveColor + " to move";

			// check?
			if ( chess.in_check() ) {
				status += ", " + moveColor + " is in check";
			}
		}
		io.in( data[0] ).emit( "fen",chess.fen() );
		console.log( status );
	}

	} );

	socket.on( "disconnect",( reason ) =>{

		console.log( reason );
		var cur=null;
		var white_player;
		var black_player;
		var match=[];
		rooms.forEach( ( r )=>{
			if( r.black_socket==socket.id ||r.white_socket==socket.id ){
				cur = r;
			}
		} );
		if(cur==null){
			console.log('chat disconnect')
		}
		else if(cur.running==false){
			console.log('game not running')
			rooms.forEach(function(item, index, object) {
				if (item.room === cur.room) {
				  object.splice(index, 1);
				}
			  });
			  r.forEach(function(item, index, object){
				if (item === cur.room) {
					object.splice(index, 1);
				  }
			  })
			  console.log(rooms, r)
		}
		else{
		if( cur.black_socket==socket.id && !cur.forfeit ){

			console.log( "works here", cur.black_user, cur.white_user );
			var query = `SELECT username, chess_elo, rd, vol FROM users WHERE username='${cur.black_user}' OR username='${cur.white_user}'`;
			console.log( query );
			db.query( query, ( err, result ) => {
				console.log( "sdsdsdsdsd",err, result );
				result.rows.forEach( function( r ){
					console.log( r.username, "this is a test for the for eahc loop" );
					if( r.username==cur.white_user ){
						if( r.rd==null && r.vol==null &&( r.chess_elo==0 || r.chess_elo==null ) ){
							white_player=ranking.makePlayer();
						}
						else{
							white_player=ranking.makePlayer( r.chess_elo, r.rd,r.vol );
						}
					}
					if( r.username==cur.black_user ){
						if( r.rd==null && r.vol==null &&( r.chess_elo==0 || r.chess_elo==null ) ){
							black_player=ranking.makePlayer();
						}
						else{
							black_player=ranking.makePlayer( r.chess_elo, r.rd,r.vol );
						}
					}
				} );
				match.push( [ white_player,black_player,1 ] );
				ranking.updateRatings( match );
				var query_w = `UPDATE users SET chess_elo=${white_player.getRating()}, rd=${white_player.getRd()}, vol=${white_player.getVol()}, wins=wins+1 WHERE username='${cur.white_user}'`;
				db.query( query_w, ( err, result ) => {console.log( err,result );} );
				var query_b = `UPDATE users SET chess_elo=${black_player.getRating()}, rd=${black_player.getRd()}, vol=${black_player.getVol()}, losses=losses+1 WHERE username='${cur.black_user}'`;
				db.query( query_b, ( err, result ) => {console.log( err,result );} );
			} );
		}
		else if( cur.white_socket==socket.id && !cur.forfeit ){
			console.log( "works here", cur.black_user, cur.white_user );
			var query = `SELECT username, chess_elo, rd, vol FROM users WHERE username='${cur.black_user}' OR username='${cur.white_user}'`;
			console.log( query );
			db.query( query, ( err, result ) => {
				console.log( "sdsdsdsdsd",err, result );
				result.rows.forEach( function( r ){
					console.log( r.username, "this is a test for the for eahc loop" );
					if( r.username==cur.white_user ){
						if( r.rd==null && r.vol==null &&( r.chess_elo==0 || r.chess_elo==null ) ){
							white_player=ranking.makePlayer();
						}
						else{
							white_player=ranking.makePlayer( r.chess_elo, r.rd,r.vol );
						}
					}
					if( r.username==cur.black_user ){
						if( r.rd==null && r.vol==null &&( r.chess_elo==0 || r.chess_elo==null ) ){
							black_player=ranking.makePlayer();
						}
						else{
							black_player=ranking.makePlayer( r.chess_elo, r.rd,r.vol );
						}
					}
				} );
				match.push( [ white_player,black_player,0 ] );
				ranking.updateRatings( match );
				var query_w = `UPDATE users SET chess_elo=${white_player.getRating()}, rd=${white_player.getRd()}, vol=${white_player.getVol()}, losses=losses+1 WHERE username='${cur.white_user}'`;
				db.query( query_w, ( err, result ) => {console.log( err,result );} );
				var query_b = `UPDATE users SET chess_elo=${black_player.getRating()}, rd=${black_player.getRd()}, vol=${black_player.getVol()}, wins=wins+1 WHERE username='${cur.black_user}'`;
				db.query( query_b, ( err, result ) => {console.log( err,result );} );

			} );

		}
		rooms.forEach( ( r )=>{
			if( r.black_socket==socket.id ||r.white_socket==socket.id ){
				r.forfeit=true;
			}
		} );
		io.in( cur.room ).emit( "opponent_disconnect" );
		rooms.forEach(function(item, index, object) {
			if (item.room === cur.room) {
			  object.splice(index, 1);
			}
		  });
		  r.forEach(function(item, index, object){
			if (item === cur.room) {
				object.splice(index, 1);
			  }
		  })
		  console.log(rooms, r)
		}
	});
});

app.get( "/rooms", ( req,res )=>{
	if(req.session.loggedin){
	var result={ "rooms":rooms };
	res.render( "pages/rooms",result );}
	else{
		res.redirect('/login')
	}
} );
app.post( "/create_room" , ( req,res )=>{
	if(req.session.loggedin){
		var room=req.session.username;
		res.redirect( "/chess"+room );
	}
	else{
		res.redirect( "login" );
	}

} );

app.post( "/join_room" , ( req,res )=>{
	if(req.session.loggedin){
		var a =req.body.room;
		console.log( a );
		res.redirect( "/chess"+req.body.room );
	}
	else{
		res.redirect( "login" );
	}
} );

app.get( "/games",( req,res )=>{
	if( req.session.loggedin ){
		res.render( "pages/games" );}
	else{
		res.redirect( "login" );
	}
} );

app.get( "/chess:id", ( req,res )=>{
	if( req.session.loggedin ){
		if( r.includes( req.params.id ) ){
			var temp;
			rooms.forEach( ( a )=>{
				if( a.room==req.params.id ){
					temp=a;
				}
			} );
			if( temp.clientnum>=2 || temp.forfeit==true ){
				res.redirect( "/rooms" );
			}
			else{
				console.log( "second" );
				var result = { "room":req.params.id, "first":false };
				res.render( "pages/chess", result );
			}
		}
		else{
			var result = { "room":req.session.username, "first":true };
			res.render( "pages/chess", result );
		}
	}
	else{
		res.redirect( "login" );
	}
} );
app.get( "/logout",function( req,res ){
	req.session.destroy( ( err ) => {
		if( err ){
			console.log( "Error has occured" );
		} else {
			res.redirect( "/login" );
		}
	} );

} );
server.listen( PORT, () => console.log( `Listening on ${ PORT }` ) );
// app.listen(PORT, () => console.log(`Listening on ${ PORT }`))
module.exports = server;
