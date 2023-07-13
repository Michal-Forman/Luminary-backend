require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
    })
);
app.use(passport.initialize());
app.use(passport.session());

// Connect to the MongoDB database
const dbUrl = process.env.MONGODB_URI;
mongoose
    .connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('Connected to the database');

        // Create a User model
        const userSchema = new mongoose.Schema({
            email: { type: String, required: true },
            firstName: { type: String, required: true },
            lastName: { type: String, required: true },
            password: { type: String, required: true },
        });

        const User = mongoose.model('User', userSchema);

        // Serialize and deserialize user for session management
        passport.serializeUser((user, done) => {
            done(null, user.id);
        });

        passport.deserializeUser((id, done) => {
            User.findById(id, (err, user) => {
                done(err, user);
            });
        });

        // Configure the local strategy for Passport
        passport.use(
            new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
                try {
                    // Find the user by email in the database
                    const user = await User.findOne({ email });

                    if (!user) {
                        return done(null, false, { message: 'Invalid email or password' });
                    }

                    // Compare the provided password with the hashed password in the database
                    const isMatch = await bcrypt.compare(password, user.password);

                    if (!isMatch) {
                        return done(null, false, { message: 'Invalid email or password' });
                    }

                    // If everything is correct, return the user object
                    return done(null, user);
                } catch (error) {
                    return done(error);
                }
            })
        );

        // Middleware for parsing JSON bodies
        app.use(express.json());

        // Waiting screen
        app.get('/', (req, res) => {
            res.json({ message: 'Hello World' });
        });

        // Registration route
        app.post('/register', async (req, res) => {
            const { email, firstName, lastName, password } = req.body;

            try {
                // Check if the user already exists in the database
                const existingUser = await User.findOne({ email });

                if (existingUser) {
                    return res.status(409).json({ message: 'User already exists' });
                }

                // Hash the password using bcrypt
                const hashedPassword = await bcrypt.hash(password, 10);

                // Create a new user instance
                const newUser = new User({
                    email,
                    firstName,
                    lastName,
                    password: hashedPassword,
                });

                // Save the new user to the database
                await newUser.save();

                // Return a success message
                res.status(200).json({ message: 'Registration successful' });
            } catch (error) {
                console.error('Error registering user:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // Login route
        app.post("/login", (req, res, next) => {
            passport.authenticate("local", (err, user, info) => {
                if (err) {
                    console.error("Error logging in:", err);
                    return res.status(500).json({ message: "Internal server error" });
                }

                if (!user) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }

                // If authentication is successful, manually log in the user
                req.login(user, async (loginErr) => {
                    try {
                        if (loginErr) {
                            console.error("Error logging in:", loginErr);
                            return res.status(500).json({ message: "Internal server error" });
                        }

                        // Authentication successful
                        const userData = await User.findOne({ email: user.email });

                        if (!userData) {
                            // Handle the case where user data is not found
                            return res.status(404).json({ message: "User data not found" });
                        }

                        const userDataWithoutPassword = {
                            _id: userData._id,
                            email: userData.email,
                            firstName: userData.firstName,
                            lastName: userData.lastName,
                        };

                        // Return success response with user data
                        return res.json({ message: userDataWithoutPassword });
                    } catch (error) {
                        console.error("Error logging in:", error);
                        return res.status(500).json({ message: "Internal server error" });
                    }
                });
            })(req, res, next);
        });

        // Start the server
        app.listen(6060, () => {
            console.log('Server is listening on port 6060');
        });
    })
    .catch((error) => {
        console.error('Error connecting to the database:', error);
    });
