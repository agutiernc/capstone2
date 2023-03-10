"use strict";

const db = require("../db");
const Event = require("./event");
const bcrypt = require("bcrypt");
const { sqlForPartialUpdate } = require("../helpers/sql");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

const { BCRYPT_WORK_FACTOR } = require("../config.js");

/** Related functions for users. */

class User {
  /** authenticate user with username, password.
   *
   * Returns { username, first_name, last_name, email, is_admin }
   *
   * Throws UnauthorizedError if user not found or wrong password.
   **/

  static async authenticate(username, password) {
    // try to find the user first
    const result = await db.query(
          `SELECT username,
                  password,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email,
                  is_admin AS "isAdmin"
           FROM users
           WHERE username = $1`,
        [username],
    );

    const user = result.rows[0];

    if (user) {
      // compare hashed password to a new hash from password
      const isValid = await bcrypt.compare(password, user.password);

      if (isValid === true) {
        delete user.password;

        return user;
      }
    }

    throw new UnauthorizedError("Invalid username/password");
  }


  /** Register user with data.
   *
   * Returns { username, firstName, lastName, email, isAdmin }
   *
   * Throws BadRequestError on duplicates.
   **/

  static async register({ username, password, firstName, lastName, email, isAdmin }) {
    const duplicateCheck = await db.query(
          `SELECT username
           FROM users
           WHERE username = $1`,
        [username],
    );

    if (duplicateCheck.rows[0]) {
      throw new BadRequestError(`Duplicate username: ${username}`);
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);

    const result = await db.query(
          `INSERT INTO users
           (username,
            password,
            first_name,
            last_name,
            email,
            is_admin)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING username, first_name AS "firstName", last_name AS "lastName", email, is_admin AS "isAdmin"`,
        [
          username,
          hashedPassword,
          firstName,
          lastName,
          email,
          isAdmin,
        ],
    );

    return result.rows[0];
  }


  /** Find all users.
   *
   * Returns [{ username, first_name, last_name, email, is_admin }, ...]
   **/

  static async getAll() {
    const result = await db.query(
          `SELECT username,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email,
                  is_admin AS "isAdmin"
           FROM users
           ORDER BY username`,
    );

    return result.rows;
  }

  
  /** Given a username, return data about user.
   *
   * Returns { username, first_name, last_name, is_admin, jobs }
   *   where jobs is { id, title, company_handle, company_name, state }
   *   where events is:
   *    { id, artist, start_time, end_time, location, contact, contact_info, district, year }
   * 
   *
   * Throws NotFoundError if user not found.
   **/

  static async get(username) {
    const userResult = await db.query(
          `SELECT username,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email,
                  is_admin AS "isAdmin"
           FROM users
           WHERE username = $1`,
        [username],
    );

    const user = userResult.rows[0];

    if (!user) throw new NotFoundError(`No user: ${username}`);
    
    const userEventsRes = await db.query(
        `SELECT e.*
          FROM user_events AS ue
          JOIN events AS e ON ue.event_id = e.id
          WHERE ue.username = $1`,
          [username]
      );
  
    user.events = userEventsRes.rows;

    return user;
  }


  /** Update user data with `data`.
   *
   * This is a "partial update" --- it's fine if data doesn't contain
   * all the fields; this only changes provided ones.
   *
   * Data can include:
   *   { firstName, lastName, password, email, isAdmin }
   *
   * Returns { username, firstName, lastName, email, isAdmin }
   *
   * Throws NotFoundError if not found.
   *
   * WARNING: this function can set a new password or make a user an admin.
   * Callers of this function must be certain they have validated inputs to this
   * or a serious security risks are opened.
   */

  static async update(username, data) {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, BCRYPT_WORK_FACTOR);
    }

    const { setCols, values } = sqlForPartialUpdate(data,
        {
          firstName: "first_name",
          lastName: "last_name",
          isAdmin: "is_admin",
        });

    const usernameVarIdx = "$" + (values.length + 1);

    const querySql = `UPDATE users 
                      SET ${setCols} 
                      WHERE username = ${usernameVarIdx} 
                      RETURNING username,
                                first_name AS "firstName",
                                last_name AS "lastName",
                                email,
                                is_admin AS "isAdmin"`;

    const result = await db.query(querySql, [...values, username]);
    const user = result.rows[0];

    if (!user) throw new NotFoundError(`No user: ${username}`);

    delete user.password;

    return user;
  }


  /** Delete given user from database; returns undefined. */

  static async delete(username) {
    let result = await db.query(
          `DELETE
           FROM users
           WHERE username = $1
           RETURNING username`,
        [username],
    );

    const user = result.rows[0];

    if (!user) throw new NotFoundError(`No user: ${username}`);
  }


  /** User can save an event
   * 
   * - user_events data contains username and eventId
   * - events table will also save all the event's data
   */

  static async saveEvent(username, eventId, data) {
    // verify that the user exists
    const verifyUsername = await db.query(`
        SELECT username
        FROM users
        WHERE username = $1
      `, [username]);
    
    const user = verifyUsername.rows[0];

    if (!user) {
      throw new NotFoundError(`Invalid username: ${username}`);
    }

    // verifies if user already saved an event in user_events table
    const verifyUserEvent = await db.query(`
        SELECT event_id, username
        FROM user_events
        WHERE event_id = $1 AND username = $2
    `, [eventId, username]);

    const savedEvent = verifyUserEvent.rows[0];

    if (savedEvent) {
      throw new NotFoundError(`Event ID (${eventId}) already saved`);
    }

    // Check if event exists, if not add it to db
    const verifyEvent = await db.query(`
        SELECT *
        FROM events
        WHERE id = $1
    `, [eventId]);

    const eventResult = verifyEvent.rows[0];

    if (!eventResult) {
      // Call method on the Event model to save event to user_events table
      await Event.create(data);
    }
    
    // add event id and user to user_events table
    await db.query(`
      INSERT INTO user_events (event_id, username)
        VALUES ($1, $2)
    `, [eventId, username]);
  }


  /** User can delete a saved event from database; returns undefined.
   *
   * Throws NotFoundError if event not found.
   **/

  static async deleteEvent(username, id) {
    const result = await db.query(`
      DELETE FROM user_events
      WHERE username = $1 AND event_id = $2
      RETURNING event_id
    `, [username, id]);

    const event = result.rows[0];

    if (!event) {
      throw new NotFoundError(`No event of id (${id}) found for user ${username}`);
    }
  }
}


module.exports = User;
