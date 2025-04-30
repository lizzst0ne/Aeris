import React, { useState, useEffect, useCallback } from 'react';
import { fetchCalendarEvents, createCalendarEvent, verifyToken } from './calendar-service';

const CalendarComponent = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState({
    message: null,
    details: null
  });

   // Get the current date and add 1 hour for default start time
   const getDefaultStartTime = () => {
    const now = new Date();
    // Round to nearest future 30-minute increment
    const minutes = now.getMinutes();
    const roundedMinutes = minutes < 30 ? 30 : 60;
    now.setMinutes(roundedMinutes, 0, 0);
    return now.toISOString().slice(0, 16); // Format for datetime-local input
  };
  
   // Get default end time (1 hour after start)
   const getDefaultEndTime = () => {
    const start = new Date(getDefaultStartTime());
    start.setHours(start.getHours() + 1);
    return start.toISOString().slice(0, 16); // Format for datetime-local input
  };



  const [newEvent, setNewEvent] = useState({
    summary: '',
    description: '',
    start: {
      dateTime: getDefaultStartTime(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    end: {
      dateTime: getDefaultEndTime(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  });

  // Get the access token from localStorage
  const accessToken = localStorage.getItem('googleAccessToken');

  // Define loadEvents with useCallback to prevent it from causing infinite re-renders
  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const calendarEvents = await fetchCalendarEvents(accessToken);
      setEvents(calendarEvents || []);
      setError({ message: null, details: null }); // Clear any previous errors
    } catch (err) {
      setError({
        message: "Failed to load calendar events",
        details: err.toString()
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken]); // accessToken as dependency

  // Use useEffect to verify token and load events on component mount
  useEffect(() => {
    if (accessToken) {
      verifyToken(accessToken).then(result => {
        if (result.valid) {
          console.log(`Token is valid and will expire in ${result.expiresIn} seconds`);
          loadEvents();
        } else {
          setError({
            message: "Your session has expired. Please log in again.",
            details: "Token verification failed"
          });
          localStorage.removeItem('googleAccessToken');
        }
      }).catch(err => {
        setError({
          message: "Failed to verify authentication",
          details: err.toString()
        });
      });
    }
  }, [accessToken, loadEvents]); // Include loadEvents in the dependency array

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Clear any previous success message when user starts editing
    setSuccess(null);
    
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
      setError({
        message: "You need to be logged in",
        details: null
      });
      return;
    }

    setCreating(true);
    setError({ message: null, details: null }); // Clear any previous errors
    setSuccess(null); // Clear any previous success message
    
    try {
      // Create a properly formatted event object
      const eventData = {
        summary: newEvent.summary,
        description: newEvent.description,
        start: {
          dateTime: new Date(newEvent.start.dateTime).toISOString(),
          timeZone: newEvent.start.timeZone
        },
        end: {
          dateTime: new Date(newEvent.end.dateTime).toISOString(),
          timeZone: newEvent.end.timeZone
        }
      };

  // For debugging
  console.log("Submitting event:", eventData);
      
  const createdEvent = await createCalendarEvent(accessToken, eventData);
  
  // Set success message
  setSuccess(`Event "${newEvent.summary}" created successfully!`);   
  
        // Reset form
        setNewEvent({
          summary: '',
          description: '',
          start: {
            dateTime: getDefaultStartTime(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          end: {
            dateTime: getDefaultEndTime(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        });
        
        // Reload events to show the new one
        loadEvents();
      } catch (err) {
        setError({
          message: "Failed to create event",
          details: err.toString()
        });
      } finally {
        setCreating(false);
      }
    };

  if (!accessToken) {
    return <p>Please log in with Google to access your calendar</p>;
  }

  return (
    <div className="calendar-container">
      <h2>Your Google Calendar Events</h2>
      
      {error.message && (
        <div className="error-container">
          <p className="error-message">{error.message}</p>
          {error.details && (
            <div className="error-details">
              <details>
                <summary>Technical Details</summary>
                <pre>{error.details}</pre>
              </details>
            </div>
          )}
        </div>
      )}
      
      {success && (
        <div className="success-container">
          <p className="success-message">{success}</p>
        </div>
      )}
      
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
        <button type="submit" disabled={creating}>
          {creating ? 'Creating...' : 'Create Event'}
        </button>
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