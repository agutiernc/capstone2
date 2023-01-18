CREATE TABLE users (
  username VARCHAR(25) PRIMARY KEY,
  password TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL
    CHECK (position('@' IN email) > 1)
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  artist VARCHAR(30),
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  location TEXT NOT NULL,
  contact TEXT NULL,
  contact_info TEXT,
  district TEXT,
  year INTEGER NOT NULL
);

CREATE TABLE user_events (
  username VARCHAR(25)
    REFERENCES users ON DELETE CASCADE,
  event_id INTEGER
    REFERENCES events ON DELETE CASCADE,
  PRIMARY KEY (username, event_id)
);