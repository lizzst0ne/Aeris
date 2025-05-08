// calendar-service.js
const API_KEY = "AIzaSyCZG35-Cpxxh0cuQAD888ExXtcq5oKDigA";// The API key you created

// Function to fetch user's calendar events
export const fetchCalendarEvents = async (accessToken) => {
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Authentication failed: Token may be expired");
      } else if (response.status === 403) {
        throw new Error("Authorization failed: Insufficient permissions");
      } else {
        throw new Error(data.error?.message || `API error: ${response.status}`);
      }
    }
    
    return data.items || [];
  } catch (error) {
    throw error;
  }
};

export const verifyToken = async (token) => {
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`);
    if (response.ok) {
      const data = await response.json();
      console.log("Token is valid. Expires in:", data.expires_in, "seconds");
      console.log("Token scopes:", data.scope);
      
      // Check if the token has the necessary scope for creating events
      const hasCalendarScope = data.scope.includes('https://www.googleapis.com/auth/calendar');
      const hasEventsScope = data.scope.includes('https://www.googleapis.com/auth/calendar.events');
      
      if (!hasCalendarScope && !hasEventsScope) {
        console.error("TOKEN LACKS REQUIRED SCOPES FOR CALENDAR OPERATIONS!");
        console.error("Current scopes:", data.scope);
        console.error("Needed scopes: https://www.googleapis.com/auth/calendar.events");
      }
      
      return {
        valid: true,
        expiresIn: data.expires_in,
        scopes: data.scope,
        hasRequiredScopes: hasCalendarScope || hasEventsScope
      };
    } else {
      console.error("Token validation failed");
      const errorText = await response.text();
      console.error("Error details:", errorText);
      return { valid: false, error: errorText };
    }
  } catch (error) {
    console.error("Token verification error:", error);
    return { valid: false, error: error.toString() };
  }
};

// Function to create a new calendar event
export const createCalendarEvent = async (accessToken, eventDetails) => {
  try {
    // First verify the token has the right scopes
    const tokenInfo = await verifyToken(accessToken);
    if (!tokenInfo.valid) {
      throw new Error("Invalid access token");
    }
    
    if (!tokenInfo.hasRequiredScopes) {
      throw new Error("Access token does not have required calendar scopes. Please sign in again and approve all requested permissions.");
    }
    
    const formattedEvent = formatEventDates(eventDetails);
    
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formattedEvent),
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Failed to create event:", data);
      
      // Provide more detailed error information
      if (response.status === 403) {
        throw new Error(`Authorization failed: Insufficient permissions. ${data.error?.message || ''}`);
      } else {
        throw new Error(data.error?.message || `API error: ${response.status}`);
      }
    }

    return data;
  } catch (error) {
    console.error("Error creating calendar event:", error);
    throw error;
  }
};

// Helper function to ensure dates are properly formatted
function formatEventDates(eventDetails) {
  const formattedEvent = { ...eventDetails };
  
  // Make sure start and end exist
  if (!formattedEvent.start) formattedEvent.start = {};
  if (!formattedEvent.end) formattedEvent.end = {};
  
  // Handle start date/time
  if (formattedEvent.start.dateTime) {
    // If it's already a string but not in ISO format, convert it
    if (typeof formattedEvent.start.dateTime === 'string' && 
        !formattedEvent.start.dateTime.endsWith('Z') && 
        !formattedEvent.start.dateTime.includes('+')) {
      // Convert to ISO string with timezone
      const startDate = new Date(formattedEvent.start.dateTime);
      formattedEvent.start.dateTime = startDate.toISOString();
    } else if (formattedEvent.start.dateTime instanceof Date) {
      // If it's a Date object, convert to ISO string
      formattedEvent.start.dateTime = formattedEvent.start.dateTime.toISOString();
    }
  }
  
  // Handle end date/time
  if (formattedEvent.end.dateTime) {
    // If it's already a string but not in ISO format, convert it
    if (typeof formattedEvent.end.dateTime === 'string' && 
        !formattedEvent.end.dateTime.endsWith('Z') && 
        !formattedEvent.end.dateTime.includes('+')) {
      // Convert to ISO string with timezone
      const endDate = new Date(formattedEvent.end.dateTime);
      formattedEvent.end.dateTime = endDate.toISOString();
    } else if (formattedEvent.end.dateTime instanceof Date) {
      // If it's a Date object, convert to ISO string
      formattedEvent.end.dateTime = formattedEvent.end.dateTime.toISOString();
    }
  }
  
  // Ensure timezone is set if not already
  if (formattedEvent.start.dateTime && !formattedEvent.start.timeZone) {
    formattedEvent.start.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  
  if (formattedEvent.end.dateTime && !formattedEvent.end.timeZone) {
    formattedEvent.end.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  
  return formattedEvent;
}