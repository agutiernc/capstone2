"use strict";

const express = require('express')
const cors = require("cors");
const morgan = require("morgan");
const app = express();

const { NotFoundError } = require("./expressError");
const { authenticateJWT } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const eventsRoutes = require("./routes/events");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }))
app.use(morgan("tiny"));
app.use(authenticateJWT);

// routes
app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/events", eventsRoutes);


/** Handle 404 errors -- this matches everything */
app.use(function (req, res, next) {
  return next(new NotFoundError());
});


/** Generic error handler; anything unhandled goes here. */
app.use(function (err, req, res, next) {
  if (process.env.NODE_ENV !== "test") console.error(err.stack);
  
  const status = err.status || 500;
  const message = err.message;

  return res.status(status).json({
    error: { message, status },
  });
});


module.exports = app;