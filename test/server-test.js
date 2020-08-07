var chai = require('chai');
var chaiHttp = require('chai-http');
var server = require('../index');
var should = chai.should();
var request = require('supertest');

chai.use(chaiHttp);

// Leaderboard Tests
describe('Leaderboard Tests', function() {
    let agent = request.agent(server);

    it('should load leaderboard and placeholders for twitter feed', function(done) {
        agent.post("/loginForm").send({'username':'admin', 'password':'root'})
            .end(function(err, res1) {
                agent.get('/leaderBoards')
                .end(function(err, res2) {
                    res2.should.have.status(200);
                    res2.should.be.html;
                    res2.text.should.include('<div class="tweet_hash">');
                    res2.text.should.include('<div class="embedded_feed">');
                done();
                });
            });

    });

    it('should organize players by elo with highest elo at the top', function(done) {
        agent.post("/loginForm").send({'username':'admin', 'password':'root'})
            .end(function(err, res1) {
                agent.get('/leaderBoards')
                .end(function(err, res2) {
                    res2.should.have.status(200);
                    res2.should.be.html;
                    chai.assert(res2.text.split('</script>')[5].split('<tr>')[2].split('<td>')[6].split('</td>')[0]
                            >= res2.text.split('</script>')[5].split('<tr>')[3].split('<td>')[6].split('</td>')[0]); // don't judge
                    res2.text.should.include('<div class="tweet_hash">');
                    res2.text.should.include('<div class="embedded_feed">');
                done();
                });
            });
    });

    it('should send a GET request to Twitter API', function(done) {
        agent.post("/loginForm").send({'username':'admin', 'password':'root'})
        .end(function(err, res1) {
            agent.get('/leaderBoards')
            .end(function(err, res2) {
                res2.should.have.status(200);
                res2.should.be.html;
                res2.text.should.include('<blockquote class="twitter-tweet">');
            done();
            });
        });
    });
});

// Twitter API call Tests
describe('Twitter API Call Tests', function() {
    let agent = request.agent(server);

    it('should receive a redirect to authorization site', function(done) {
        agent.post("/loginForm").send({'username':'admin', 'password':'root'})
        .end(function(err, res1) {
            agent.get('/tweetAuth')
            .end(function(err, res2) {
                res2.should.have.status(302);
                res2.header.location.should.include("?oauth_token");
            done();
            });
        });
    });

    it('should redirect back to leaderboards since no user tokens are available in testing', function(done) {
        agent.post("/loginForm").send({'username':'admin', 'password':'root'})
        .end(function(err, res1) {
            agent.get('/tweetAuthed?denied')
            .end(function(err, res2) {
                res2.should.have.status(302);
            done();
            });
        });
    });

});


describe("Testing login and register functions with different sets of credentials", function(){
    it("should log the user in", function(done){
      chai.request(server).post("/loginForm").send({'username':'admin', 'password':'root'})
        .end(function(err,res){
          res.text.should.not.include('incorrect');
          res.should.be.html;
          res.should.have.status(200);
          done();
        })
    })
  
    it("should not log the user in", function(done){
      chai.request(server).post("/loginForm").send({'username':'admin', 'password':'notthecorrectpassword'})
        .end(function(err,res){
          res.text.should.include('incorrect');
          res.should.be.html;
          res.should.have.status(200);
          done();
        })
    })
  
    it("should allow creation of account", function(done){
      chai.request(server).post("/registerForm").send({'username':'testAcc'+ Math.floor(Math.random()*1000), 'password':'testAcc'})
        .end(function(err,res){
          res.text.should.not.include('please choose another');
          res.should.be.html;
          res.should.have.status(200);
          done();
        })
    })
  
    it("should not allow creation of account due to duplicate username", function(done){
      chai.request(server).post("/registerForm").send({'username':'admin', 'password':'duplicateusername'})
        .end(function(err,res){
          res.text.should.include('username is already taken');
          res.should.be.html;
          res.should.have.status(200);
          done();
        })
    })
  
    it("should not allow creation of account due to duplicate email", function(done){
      chai.request(server).post("/registerForm").send({'username':'nottakenusername', 'password':'notthecorrectpassword', 'email': 'splatwebservices@gmail.com'})
        .end(function(err,res){
          res.text.should.include('email is already taken');
          res.should.be.html;
          res.should.have.status(200);
          done();
        })
    })
    it("should not allow access to site because no session username", function(done){
      chai.request(server).get("/userView")
        .end(function(err,res){
          res.text.should.include('Enter your username');
          res.should.be.html;
          res.should.have.status(200);
          done();
        })
    })
  })