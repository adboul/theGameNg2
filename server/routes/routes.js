'user strict'

var User 			= require('../models/user.js'),
	Role 			= require('../models/role.js'),
	passportLocal 	= require('passport-local'),
	mailUtils		= require('../utils/mails.js'),
	config		    = require('../config.js'),
	crypto 			= require('../utils/crypto.js');

module.exports = function(app, passport, role) {

	passport.use(new passportLocal.Strategy(verifyCredentials));

	// login ===================================================================

	// log in
	app.post('/api/login', auth, function(req, res) {
		User.findOne({_id:req.user._id}, function(err, user) {
			user.lastConnexion = new Date();
			user.save();
			res.sendStatus(200);
		})
	});

	function auth(req, res, next) {
		passport.authenticate('local', function(err, user, info) {
			if (!user) return res.status(401).send(info);
			req.logIn(user, function(err) {
				if (err) {
					return next(err);
				}
				return res.sendStatus(200);
			});
		})(req, res, next);
	}

	// get current user
	app.get('/api/login', function(req, res) {
		console.log(req.user);
		res.send({
			isAuthenticated: req.isAuthenticated(),
			user: (req.user) ? req.user : {}
		});
	});

	// logout
	app.delete('/api/login', function(req, res) {
		req.logout();
		res.sendStatus(200);
	});

	// sign up ==============================================================

	app.post('/api/signup', function(req, res) {
		var user = {
			username: req.body.username,
			email: req.body.email,
			password: req.body.password,
			passwordConfirmation: req.body.passwordConfirmation
		}

		signUp(user, function(err, user){
			if (err) {
				res.status(400).send(err);
			} else {
				res.sendStatus(200);
			}
		});
	});

	app.get('/api/signup/username/:username', function(req, res) {
		User.count({username:req.params.username}, function(err, nb) {
			res.send({exists:nb !== 0});
		})
	});

	app.get('/api/signup/email/:email', function(req, res) {
		User.count({email:req.params.email}, function(err, nb) {
			res.send({exists:nb !== 0});
		})
	});

	app.get('/api/signup/valid/:token', function(req, res) {
		User.findOne({email_token:req.params.token}, function(err, user) {
			if (err) {
				return res.status(500).send("ERRVAL500");
			}
			if (user) {
				if (user.email_confirm === true) return res.status(400).send("ERRVAL400");
				if (user.actif === false) return res.status(403).send("ERRVAL403"); 

				user.email_confirm = true;
				user.email_token = undefined;
				user.save(function(err) {
					if (err) {
						return res.status(500).send("ERRVAL500");
					} else {
						return res.sendStatus(200);
					}
				});
			} else {
				return res.status(404).send("ERRVAL404");
			}
			
		})
	});

	// Change Password =======================================================
	
	app.get('/api/forgot/email/:email', function(req, res) {
		motDePasseOubli(req.params.email, function(err) {
			if (err) {
				return res.status(500).send(err);
			} else {
				return res.sendStatus(200);
			}
		})
	});

	app.post('/api/forgot', function(req, res) {
		changePassword(req.body, function(err) {
			if (err) {
				return res.status(500).send(err);
			} else {
				return res.sendStatus(200);
			}
		})
	});


	// admin ==================================================================

	// ramène le nombre d'utilisateurs
	app.get('/api/users/count', role.want('view users'), function(req, res) {
		User.count(getUsersQuery(req), function(err, nb) {
			if (err) {
				return res.sendStatus(500);
			} else {
				return res.send({count:nb});
			}
		})
	});

	// ramène la liste des utilisateurs
	app.get('/api/users/:page', role.want('view users'), function(req, res) {
		var page = req.params.page;
		var skip = (page - 1) * 10;
		var sort = {}; 
		
		if (req.query.sort) {
			var sortQuery = JSON.parse(req.query.sort);
			sort[sortQuery.field] = (sortQuery.asc === true) ? 1 : -1;
		} else {	
			sort.creation = -1;
		}

		User.find(getUsersQuery(req), null, {skip:skip, limit: 10, sort: sort})
			.populate('roles')
			.exec(function(err, users) {
				var usersJson = [];
				for (var i = 0; i < users.length; i++) {
					usersJson.push(users[i].toJson())
				}
				if (err) {
					res.sendStatus(500);
				} else {
					res.send(usersJson);
				}
		})
	});

	function getUsersQuery(req) {
		var query = {}

		var filtres = req.query.filtres;

		if (filtres) {
			filtres = JSON.parse(filtres);
		} else {
			filtres = [];
		}

		for (var i = 0; i < filtres.length; i++) {
			switch (filtres[i].name) {
				case "roles":
					query.roles = {
						"$in":filtres[i].data
					}
					break;
				case "username":
					query.username = new RegExp(filtres[i].data[0], 'i');
					break;
			}
		}
		return query;
	}

	// active/desactive des utilisateurs
	app.post('/api/users/actif', 

		// middlewares
		// vérifie que l'utilisateur connecté peut activer/desactiver des utilisateurs
		role.want('toogle user'), 

		// verifie que l'utilisateur connecté peut agir sur un utilisateur
		// -1 -> différence de lvl nécessaire (-1 : au moins moins bon de 1)
		// field:ids -> les ids des utilisateurs sur lesquels on veut agir sont renseignés dans le body sous le field 'ids'
		// isArray:true -> on agit sur plusieurs utilisateurs 
		role.levelDelta(-1, {field:'ids', isArray:true}), 

		function(req, res) {
			User.find({'_id': { $in: req.body.ids}}, function(err, users) {
				if (err) {
					res.sendStatus(500);
				} else {
					for (var i = 0; i < users.length; i++) {
						var user = users[i];
						user.actif = req.body.actif;
						user.save(function(err) {
							if (err) {
								res.sendStatus(500);
							} else {
								res.sendStatus(200);
							}
						});
					}
				}
			})
	});

	// active/desactive des utilisateurs
	app.post('/api/users/confirmemail', 

		// middlewares
		role.want('confirm email'), 
		role.levelDelta(-1, {field:'ids', isArray:true}), 

		function(req, res) {
			User.find({'_id': { $in: req.body.ids}}, function(err, users) {
				if (err) {
					return res.sendStatus(500);
				} else {
					for (var i = 0; i < users.length; i++) {
						var user = users[i];
						if (req.body.confirm === true) {
							user.email_confirm = true;
							user.email_token = undefined;
						} else if (req.body.confirm === false) {
							user.email_confirm = false;
							user.email_token = undefined;
						} else {
							return res.sendStatus(500);	
						}
						user.save(function(err) {
							if (err) {
								return res.sendStatus(500);
							} else {
								return res.sendStatus(200);
							}
						});
					}
				}
			})
	});

	// ramène la liste des roles actifs
	app.get('/api/roles', 

		role.want('view roles'), 

		function(req, res) {
			Role.find({}, function(err, roles) {
				if (err) {
					res.sendStatus(500);
				} else {
					res.send(roles);
				}
			})
	});

	// retire un role à un utilisateur
	app.post('/api/users/role/delete', 

		// middlewares
		// vérifie que l'utilisateur connecté peut retirer des roles
		role.want("remove role"), 
		// verifie que l'utilisateur connecté peut agir sur un utilisateur
		// -1 -> différence de lvl nécessaire (-1 : au moins moins bon de 1)
		// field:id -> l'id de l'utilisateur sur lequel on veut agir est renseigné dans le body sous le field 'id'
		// isArray:false -> on agit sur un seul utilisateur 
		role.levelDelta(-1, {field:'id', isArray:false}), 
		// verifie que l'utilisateur connecté peut agir sur le role
		// -1 -> différence de lvl nécessaire (-1 : au moins moins bon de 1)
		// field:roleId -> l'id du role sur lequel on veut agir est renseigné dans le body sous le field 'roleId'
		role.actRole(-1, {field:'roleId'}), 

		function(req, res) {
			User.findOne({'_id': req.body.id})
				.populate('roles')
				.exec(function(err, user) {
					if (err) {
						res.sendStatus(500);
					} else {
						for (var i = 0; i < user.roles.length; i++) {
							if (user.roles[i].id === req.body.roleId) {
								user.roles.splice(i, 1);
							}
						}
						user.markModified('roles');
						user.save(function(err) {
							if (err) {
								res.sendStatus(500);
							} else {
								res.sendStatus(200);
							}
						});
					}
			})
	});

	// ajoute un role à un utilisateur
	app.post('/api/users/role/add', 

			// middlewares
			// vérifie que l'utilisateur connecté peut ajouter des roles
			role.want("add role"), 
			// verifie que l'utilisateur connecté peut agir un utilisateur
			// 0 -> différence de lvl nécessaire (0 : même lvl ou moins bon)
			// field:id -> l'id de l'utilisateur sur lequel on veut agir est renseigné dans le body sous le field 'id'
			// isArray:false -> on agit sur un seul utilisateur 
			role.levelDelta(0, {field:'id', isArray:false}), 
			// verifie que l'utilisateur connecté peut agir sur le role
			// 0 -> différence de lvl nécessaire (0 : même lvl ou moins bon)
			// field:roleId -> l'id du role sur lequel on veut agir est renseigné dans le body sous le field 'roleId'
			role.actRole(0, {field:'roleId'}), 
			
			function(req, res) {
				User.findOne({'_id': req.body.id})
					.populate('roles')
					.exec(function(err, user) {
						if (err) {
							res.sendStatus(500);
						} else {
							for (var i = 0; i < user.roles.length; i++) {
								if (user.roles[i].id === req.body.roleId) {
									return res.sendStatus(400);
								}
							}
							user.roles.push(req.body.roleId);
							user.markModified('roles');
							user.save(function(err) {
								if (err) {
									res.sendStatus(500);
								} else {
									res.sendStatus(200);
								}
							});
						}
				})
	});

	function verifyCredentials(username, password, done) {
		User.findOne({username: username}, function(err, user) {
			if (!err && user) {
				user.verifyCredentials(password, function(err, passwordOk) {
					if (passwordOk && !err) {
						return done(null, user.toJson());
					} else {
						return done(null, null, err);
					}
				})
			} else {
				setTimeout(function() {
					return done(null, null, "ERLOG404");
				}, 1000);
			}
		})
	}

	function signUp(userData, done) {
		if (userData.passwordConfirmation === userData.password) {
			User.findOne({username: userData.username}, function(err, user) {
				if (user) {
					done("ERRLOG403");
				} else {
					crypto.hash(userData.password, function(err, hash) {
						if (err) {
							callback(err);
						} else {
							Role.findOne({alias:'ROLE_USER'}, function(err, role) {
								crypto.generateToken(8, function(err, token){
									var user = new User({
										username: userData.username,
										password: hash.toString('base64'),
										email: userData.email,
										email_confirm: false,
										email_token: token,
										roles: [role.id],
										actif: true,
										creation: new Date()
									});
									user.save(function(err, user) {
										if (!err) {

											var appUrl = "http://" + config.host;
											appUrl += (config.port.length != 0) ? ":" + config.port : ""; 

											var mail = {
												from: '"The Game" <the@game.com>',
												to: userData.email,
												subject: 'Confirmation email',
												html: '<b><a href="' + appUrl + '/login/validate/' + token + '">Confirmer mon mail</a></b>'
											}
											mailUtils.sendMail(mail, function(err, info) {
												if (err) {
													// todo si pb mail
												}
											});
											done(err, user);
										} else {
											errors = [];
											if (err.errors) {
												if (err.errors.email) {
													errors.push("ERRLOG052");
												}
											}
											done(errors, user);	
										}
									});
								})
							})
						}
					})
				}
			})
		} else if (userData.passwordConfirmation != userData.password){
			done("Les mot de passes ne sont pas identiques");
		} else if (password.length <= 5){
			done("Mot de passe trop petit, veuillez utiliser 3 caractères au minimun");
		}
	}

	function motDePasseOubli(email, done) {
		User.findOne({email: email}, function(err, user) {
			if (!user) {
				done("ERRMAIL404");
			} else if (user.actif === false) {
				done("ERRLOG401");
			} else {
				crypto.generateToken(8, function(err, token){
					crypto.hash(token, function(err, hash) {
						user.password_token = hash.toString('base64');
						user.save();
						var appUrl = "http://" + config.host;
						appUrl += (config.port.length != 0) ? ":" + config.port : ""; 
						var mail = {
							from: '"The Game" <the@game.com>',
							to: email,
							subject: 'Changer mot de passe',
							html: '<b><a href="' + appUrl + '/login/forgot/' + email + '/' + token + '">Changer mot de passe</a></b>'
						}
						mailUtils.sendMail(mail, function(err, info) {
							if (err) {
								// todo si pb mail
							}
						});
						done(err);
					})
				});
			}
		});
	}

	function changePassword(userData, done) {
		if (userData.passwordConfirmation === userData.password) {
			User.findOne({email: userData.email}, function(err, user) {
				if (err) {
					return done("ERR99");
				}
				if (!user) {
					return done("ERRMAIL404");
				}
				if (!user.password_token) {
					return done("ERRTOK400");	
				}
				var combined = new Buffer(user.password_token, 'base64');
				crypto.verify(userData.token, combined, function(err, tokenOk) {
					if (!err && !tokenOk) {
						return done("ERRTOK403");
					}
					crypto.hash(userData.password, function(err, hash) {
						if (err) {
							return done("ERRMP500");
						} else {
							user.password = hash.toString('base64');
							user.password_token = undefined;
							user.save();
						};
					})
					return done();
				})
			})
		} else if (userData.passwordConfirmation != userData.password){
			done("Les mot de passes ne sont pas identiques");
		} else if (password.length <= 5){
			done("Mot de passe trop petit, veuillez utiliser 3 caractères au minimun");
		}
	}

}
