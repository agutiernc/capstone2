import React, { useState, useEffect } from 'react';
import ConcertsApi from '../../api/api';

// this will be for user saved events
// change code later

const UserEvents = () => {
  const [events, setEvents] = useState([])

  // get all events
  useEffect(() => {
    const eventsList = async () => {
      let events = await ConcertsApi.getAllEvents()
  
      setEvents(events)
    }

    eventsList()
  }, [])

  // console.log(events)

  return (
    <div>
      <h1>Saved Events</h1>
    </div>
  )
}

export default UserEvents;