require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const session = require("express-session");
const { Configuration, OpenAIApi } = require("openai");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// OpenAI API
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

// Connect to the MongoDB database
const dbUrl = process.env.MONGODB_URI;
mongoose
  .connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("Connected to the database");

    // Create a User model
    const userSchema = new mongoose.Schema({
      email: { type: String, required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      password: { type: String, required: true },
    });

    const User = mongoose.model("User", userSchema);

    // Create a Journal model
    const journalSchema = new mongoose.Schema({
      mood: { type: Number, required: true },
      content: { type: String, required: true },
      date: { type: String, required: true },
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    });

    const Journal = mongoose.model("Journal", journalSchema);

    // Create a Habit model
    const habitSchema = new mongoose.Schema({
      name: { type: String, required: true },
      dailyGoal: { type: Number, required: true },
      streak: { type: Number, required: true, default: 0 },
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    });

    const Habit = mongoose.model("Habit", habitSchema);

    // Create a Exercise model
    const exerciseSchema = new mongoose.Schema({
      name: { type: String, required: true },
      weight: { type: Number, required: true },
      repetition1: { type: Number, required: true },
      repetition2: { type: Number, required: true },
      repetition3: { type: Number, required: true },
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    });

    const Exercise = mongoose.model("Exercise", exerciseSchema);

    // Create a Exercise Progression model
    const exerciseProgressionSchema = new mongoose.Schema({
      saves: [
        {
          weight: { type: Number, required: true },
          date: { type: String, required: true },
        },
      ],
      exercise: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise" },
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    });

    const ExerciseProgression = mongoose.model(
      "ExerciseProgression",
      exerciseProgressionSchema,
    );

    // Create a messagess model
    const messagesSchema = new mongoose.Schema({
      messages: [
        {
          message: { type: String, required: true },
          texter: { type: String, required: true },
        },
      ],
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    });

    const Messages = mongoose.model("Messages", messagesSchema);

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
      new LocalStrategy(
        { usernameField: "email" },
        async (email, password, done) => {
          try {
            // Find the user by email in the database
            const user = await User.findOne({ email });

            if (!user) {
              return done(null, false, {
                message: "Invalid email or password",
              });
            }

            // Compare the provided password with the hashed password in the database
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
              return done(null, false, {
                message: "Invalid email or password",
              });
            }

            // If everything is correct, return the user object
            return done(null, user);
          } catch (error) {
            return done(error);
          }
        },
      ),
    );

    // Middleware for parsing JSON bodies
    app.use(express.json());

    // Waiting screen
    app.get("/", (req, res) => {
      res.json({ message: "Hello World" });
    });

    // Registration route
    app.post("/register", async (req, res) => {
      const { email, firstName, lastName, password } = req.body;

      try {
        // Check if the user already exists in the database
        const existingUser = await User.findOne({ email });

        if (existingUser) {
          return res.status(409).json({ message: "User already exists" });
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

        const userData = await User.findOne({ email: email });

        const userDataWithoutPassword = {
          _id: userData._id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
        };

        // Return success response with user data
        return res.json({ message: userDataWithoutPassword });

        // Return a success message
      } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).json({ message: "Internal server error" });
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

    // Create a new journal route
    app.post("/journal", async (req, res) => {
      const { mood, content, date, userEmail } = req.body;

      try {
        // Find the user document based on the userEmail
        const user = await User.findOne({ email: userEmail });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Create the journal document and associate it with the user
        const journal = new Journal({
          mood: mood,
          content: content,
          date: date,
          user: user._id,
        });

        // Save the journal document
        await journal.save();

        return res
          .status(201)
          .json({ message: "Journal created successfully" });

        // Save the new journal to the database
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
      }
    });

    // Fetch all journals for a user
    app.get("/journals/:id", async (req, res) => {
      try {
        const userId = req.params.id;

        // Find the user document based on the provided user ID
        const user = await User.findById(userId);

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Fetch the journals associated with the user
        const journals = await Journal.find({ user: user._id });

        return res.json(journals);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
      }
    });

    // Delete a journal
    app.delete("/journals/:id", async (req, res) => {
      const journalId = req.params.id;

      try {
        // Delete the journal entry from the database using the journalId
        await Journal.findByIdAndDelete(journalId);

        // Send a success response back to the client
        res.sendStatus(204); // No Content
      } catch (error) {
        console.error(error);
        res.sendStatus(500); // Internal Server Error
      }
    });

    // Create new habit
    app.post("/habit", async (req, res) => {
      const { habitName, habitDailyGoal, userEmail } = req.body;
      try {
        console.log(habitName, habitDailyGoal, userEmail, "THIS IS IMPORTANT");
        const user = await User.findOne({ email: userEmail });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const habit = new Habit({
          name: habitName,
          dailyGoal: habitDailyGoal,
          streak: 0,
          user: user._id,
        });

        await habit.save();

        return res.status(201).json({ message: "Habit created successfully" });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
      }
    });

    app.get("/habit/:id", async (req, res) => {
      try {
        const userId = req.params.id;

        const user = await User.findById(userId);

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const habits = await Habit.find({ user: user._id });

        return res.json(habits);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
      }
    });

    // Create new exercise
    app.post("/exercise", async (req, res) => {
      console.log(req.body);
      const {
        exerciseName,
        exerciseWeight,
        repetition1,
        repetition2,
        repetition3,
        userEmail,
      } = req.body;

      const date = new Date();
      const today =
        date.getDate() +
        ". " +
        (date.getMonth() + 1) +
        ". " +
        date.getFullYear();

      try {
        console.log(
          exerciseName,
          exerciseWeight,
          repetition1,
          repetition2,
          repetition3,
          userEmail,
          "THIS IS IMPORTANT",
        );
        const user = await User.findOne({ email: userEmail });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const exercise = new Exercise({
          name: exerciseName,
          weight: exerciseWeight,
          repetition1: repetition1,
          repetition2: repetition2,
          repetition3: repetition3,
          user: user._id,
        });

        await exercise.save();

        const exerciseId = exercise._id;

        const save = {
          weight: exerciseWeight,
          date: today,
        };

        const exerciseProgression = new ExerciseProgression({
          saves: [save],
          exercise: exerciseId,
          user: user._id,
        });

        await exerciseProgression.save();

        console.log(exercise, "THIS IS IMPORTANT, this is final exercise<-");

        return res.status(201).json({ message: "Habit created successfully" });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
      }
    });

    // Fetch all exercises for a user
    app.get("/exercise/:id", async (req, res) => {
      try {
        const userId = req.params.id;

        // Find the user document based on the provided user ID
        const user = await User.findById(userId);

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Fetch the journals associated with the user
        const exercises = await Exercise.find({ user: user._id });

        return res.json(exercises);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
      }
    });

    // Delete an exercise
    app.delete("/exercise/:id", async (req, res) => {
      const exerciseId = req.params.id;

      try {
        await Exercise.findByIdAndDelete(exerciseId);

        res.sendStatus(204);
      } catch (error) {
        console.error(error);
        res.sendStatus(500);
      }
    });

    // Change an exercise
    app.put("/exercise/", async (req, res) => {
      console.log(req.body);
      const {
        exerciseId,
        exerciseName,
        exerciseWeight,
        repetition1,
        repetition2,
        repetition3,
      } = req.body;

      const date = new Date();
      const today =
        date.getDate() +
        ". " +
        (date.getMonth() + 1) +
        ". " +
        date.getFullYear();

      try {
        weightChanged =
          (await Exercise.findById(exerciseId).weight) !== exerciseWeight;

        await Exercise.findByIdAndUpdate(exerciseId, {
          name: exerciseName,
          weight: exerciseWeight,
          repetition1: repetition1,
          repetition2: repetition2,
          repetition3: repetition3,
        });

        if (weightChanged) {
          const save = {
            weight: exerciseWeight,
            date: today,
          };

          const notLastTodaysSave = await ExerciseProgression.findOne({
            exercise: exerciseId,
            "saves.date": today,
          });
          if (notLastTodaysSave) {
            await ExerciseProgression.findOneAndUpdate(
              { exercise: exerciseId, "saves.date": today },
              {
                $set: {
                  "saves.$.weight": exerciseWeight,
                },
              },
            );

            res.sendStatus(204);
          } else {
            const exerciseProgression = await ExerciseProgression.findOne({
              exercise: exerciseId,
            });

            exerciseProgression.saves.push(save);

            await exerciseProgression.save();

            res.sendStatus(204);
          }
        } else {
          res.sendStatus(204);
        }
      } catch (error) {
        console.error(error);
        res.sendStatus(500);
      }
    });

    // Get exercise progression
    app.get("/exercise_progression/:id", async (req, res) => {
      try {
        const exerciseId = req.params.id;

        const exerciseProgression = await ExerciseProgression.findOne({
          exercise: exerciseId,
        });

        if (!exerciseProgression) {
          return res
            .status(404)
            .json({ error: "Exercise Progression not found" });
        }

        return res.json(exerciseProgression.saves);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
      }
    });

    app.post("/chat-therapist", async (req, res) => {
      const prompt = req.body;
      console.log(prompt);
      const chat_completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You talk like a nice, kind old psychologist, who mostly listens to his patients. But you talk really shortly, usually just few words.",
          },
          {
            role: "system",
            content:
              "Your job is to make your patients feel better, and you do that by listening to them and giving them advice.",
          },
          {
            role: "system",
            content:
              "You can also try cheering them up or motivating them to do something.",
          },
          {
            role: "user",
            content: `${prompt}`,
          },
        ],
        temperature: 0.9,
        max_tokens: 100,
        frequency_penalty: 0,
        presence_penalty: 0,
      });
      const reply = chat_completion.data.choices[0].message.content;
      res.send(reply);
    });

    // Start the server
    app.listen(6060, () => {
      console.log("Server is listening on port 6060");
    });
  })
  .catch((error) => {
    console.error("Error connecting to the database:", error);
  });
