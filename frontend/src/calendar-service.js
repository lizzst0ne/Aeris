// calendar-service.js
const API_KEY = "AIzaSyCZG35-Cpxxh0cuQAD888ExXtcq5oKDigA"; // The API key you created

// Function to fetch user's calendar events
export const fetchCalendarEvents = async (accessToken) => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?key=${API_KEY}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Google Calendar API error: ${response.status}`);
    }

    const data = await response.json();
    return data.items;
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    throw error;
  }
};

// Function to create a new calendar event
export const createCalendarEvent = async (accessToken, eventDetails) => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventDetails),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create event: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error creating calendar event:", error);
    throw error;
  }
};