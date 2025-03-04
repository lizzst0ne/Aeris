import React, { useState, useEffect } from 'react';
import { fetchCalendarEvents, createCalendarEvent } from './calendar-service';

const CalendarComponent = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newEvent, setNewEvent] = useState({
    summary: '',
    description: '',
    start: {
      dateTime: '',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    end: {
      dateTime: '',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  });

  // Get the access token from localStorage
  const accessToken = localStorage.getItem('googleAccessToken');

  useEffect(() => {
    if (accessToken) {
      loadEvents();
    }
  }, [accessToken]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const calendarEvents = await fetchCalendarEvents(accessToken);
      setEvents(calendarEvents || []);
    } catch (err) {
      setError("Failed to load calendar events");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'startDateTime' || name === 'endDateTime') {
      // Handle datetime inputs
      const eventField = name === 'startDateTime' ? 'start' : 'end';
      setNewEvent({
        ...newEvent,
        [eventField]: {
          ...newEvent[eventField],
          dateTime: value
        }
      });
    } else {
      // Handle regular inputs
      setNewEvent({
        ...newEvent,
        [name]: value
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accessToken) {
      setError("You need to be logged in");
      return;
    }

    try {
      await createCalendarEvent(accessToken, newEvent);
      // Reset form
      setNewEvent({
        summary: '',
        description: '',
        start: {
          dateTime: '',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: '',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      });
      // Reload events
      loadEvents();
    } catch (err) {
      setError("Failed to create event");
    }
  };

  if (!accessToken) {
    return <p>Please log in with Google to access your calendar</p>;
  }

  return (
    <div className="calendar-container">
      <h2>Your Google Calendar Events</h2>
      
      {error && <p className="error-message">{error}</p>}
      
      {/* Create New Event Form */}
      <form onSubmit={handleSubmit} className="event-form">
        <h3>Create New Event</h3>
        <div>
          <label>Title</label>
          <input 
            type="text" 
            name="summary" 
            value={newEvent.summary} 
            onChange={handleInputChange} 
            required 
          />
        </div>
        <div>
          <label>Description</label>
          <textarea 
            name="description" 
            value={newEvent.description} 
            onChange={handleInputChange}
          />
        </div>
        <div>
          <label>Start Time</label>
          <input 
            type="datetime-local" 
            name="startDateTime" 
            value={newEvent.start.dateTime} 
            onChange={handleInputChange} 
            required 
          />
        </div>
        <div>
          <label>End Time</label>
          <input 
            type="datetime-local" 
            name="endDateTime" 
            value={newEvent.end.dateTime} 
            onChange={handleInputChange} 
            required 
          />
        </div>
        <button type="submit">Create Event</button>
      </form>
      
      {/* Events List */}
      <div className="events-list">
        <h3>Upcoming Events</h3>
        {loading ? (
          <p>Loading events...</p>
        ) : events.length > 0 ? (
          <ul>
            {events.map((event) => (
              <li key={event.id} className="event-item">
                <h4>{event.summary}</h4>
                <p>{event.description}</p>
                <p>
                  <strong>Start:</strong> {new Date(event.start.dateTime).toLocaleString()}
                </p>
                <p>
                  <strong>End:</strong> {new Date(event.end.dateTime).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No events found</p>
        )}
      </div>
    </div>
  );
};

export default CalendarComponent;