const express = require ("express");
const cors = require("cors");

const app = express();
app.use(cors());

app.get("/", (req, res) => {
    res.json({ message: "Hello World" });
});

app.listen(6060, () => {
    console.log("Server is listening on port 6060");
});

