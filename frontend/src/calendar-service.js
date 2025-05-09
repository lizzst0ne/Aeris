// calendar-service.js
// Functions for interacting with Google Calendar API

// Function to fetch calendar events
export const fetchCalendarEvents = async (accessToken) => {
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const timeMin = new Date().toISOString(); // Now
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 30); // 30 days from now

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax.toISOString())}&maxResults=10&singleEvents=true&orderBy=startTime`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to fetch events: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  return data.items || [];
};

// Function to verify token
export const verifyToken = async (token) => {
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`);
    
    if (!response.ok) {
      return { valid: false, error: `Status ${response.status}: ${response.statusText}` };
    }
    
    const data = await response.json();
    return {
      valid: true,
      expiresIn: data.expires_in,
      scope: data.scope
    };
  } catch (err) {
    console.error('Token verification error:', err);
    return { valid: false, error: err.message };
  }
};

// Function to create a calendar event
export const createCalendarEvent = async (accessToken, eventData) => {
  if (!accessToken) {
    throw new Error('No access token available');
  }

  if (!eventData || !eventData.summary) {
    throw new Error('Invalid event data');
  }

  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventData)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to create event: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
  }

  return response.json();
};

/**
 * Parse text into event details
 * This version prioritizes using dateInfo from the Bluetooth device
 */
export const parseTextToEventDetails = (text, dateInfo = null) => {
  if (!text || text === 'No text detected') {
    return null;
  }
  
  try {
    // Split text into lines and remove empty lines
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) return null;
    
    // Use the first line as the event title
    const title = lines[0].trim();
    
    // Initialize event information
    let eventDate = null;
    let eventTime = null;
    let description = '';
    
    // PRIORITIZE dateInfo from Bluetooth device if available
    if (dateInfo) {
      const [month, day] = dateInfo.split(',').map(Number);
      if (!isNaN(month) && !isNaN(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const currentYear = new Date().getFullYear();
        eventDate = `${currentYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        console.log(`Using date from Bluetooth device: ${month}/${day} -> ${eventDate}`);
      }
    }
    
    // Only try to parse date from text if we don't have dateInfo from device
    if (!eventDate) {
      // Check for date in the format MM/DD, MM-DD or similar
      const dateRegex = /(\d{1,2})[\/\-](\d{1,2})/;
      
      // Look through lines for date patterns
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for date
        const dateMatch = line.match(dateRegex);
        if (dateMatch && !eventDate) {
          const month = parseInt(dateMatch[1]);
          const day = parseInt(dateMatch[2]);
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            // Use current year for the date
            const currentYear = new Date().getFullYear();
            eventDate = `${currentYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            console.log(`Parsed date from text: ${month}/${day} -> ${eventDate}`);
          }
        }
      }
    }
    
    // Look for time in the text (regardless of where we got the date from)
    // Check for time in the format HH:MM AM/PM or 24hr
    const timeRegex = /(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i;
    
    // Look through lines for time patterns
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for time
      const timeMatch = line.match(timeRegex);
      if (timeMatch && !eventTime) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : null;
        
        // Convert to 24-hour format if AM/PM is specified
        if (ampm === 'PM' && hours < 12) {
          hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
          hours = 0;
        }
        
        eventTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
        console.log(`Parsed time from text: ${hours}:${minutes} -> ${eventTime}`);
      }
    }
    
    // Create description from all non-title lines
    if (lines.length > 1) {
      description = lines.slice(1).join('\n');
    }
    
    // Default to today if no date detected
    if (!eventDate) {
      const today = new Date();
      eventDate = today.toISOString().split('T')[0];
      console.log(`No date found, defaulting to today: ${eventDate}`);
    }
    
    // Default time if none detected
    if (!eventTime) {
      eventTime = '12:00:00'; // Default to noon
      console.log(`No time found, defaulting to noon: ${eventTime}`);
    }
    
    // Create start and end times (1 hour duration by default)
    const startDateTime = new Date(`${eventDate}T${eventTime}`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // Add 1 hour
    
    return {
      summary: title,
      description: description,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };
  } catch (err) {
    console.error('Error parsing text to event:', err);
    return null;
  }
};

/**
 * Get access token from localStorage or URL fragment
 * Returns { token, isValid } object
 */
export const getAccessToken = async () => {
  // First check localStorage
  let token = localStorage.getItem('googleAccessToken');
  
  // If no token in localStorage, check URL fragment (for redirects)
  if (!token) {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const urlToken = params.get('access_token');
    
    if (urlToken) {
      token = urlToken;
      
      // Store in localStorage for future use
      localStorage.setItem('googleAccessToken', token);
      
      // Remove the token from the URL for security
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
  
  // Verify the token if we have one
  if (token) {
    const tokenInfo = await verifyToken(token);
    return {
      token,
      isValid: tokenInfo.valid,
      expiresIn: tokenInfo.expiresIn,
      error: tokenInfo.error
    };
  }
  
  return { token: null, isValid: false };
};

/**
 * Start Google OAuth flow
 */
export const startGoogleAuthFlow = () => {
  // Google OAuth 2.0 parameters
  const clientId = '1054100119575-v32a6nj5i9dlrojhscieq8sb35pis9io.apps.googleusercontent.com';
  const redirectUri = window.location.origin + window.location.pathname;
  const scope = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events';
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(scope)}` +
    `&prompt=consent`;
  
  // Redirect to Google Auth
  window.location.href = authUrl;
};

/**
 * Create calendar event from detected text
 * This is the main function to use when you want to create an event from text
 */
export const createEventFromDetectedText = async (detectedText, dateInfo = null) => {
  // Step 1: Get and verify access token
  const { token, isValid, error } = await getAccessToken();
  
  if (!token || !isValid) {
    throw new Error(`Authentication required: ${error || 'No valid token'}`);
  }
  
  // Step 2: Parse text into event details
  const eventDetails = parseTextToEventDetails(detectedText, dateInfo);
  if (!eventDetails) {
    throw new Error('Failed to extract event details from the text');
  }
  
  // Step 3: Create the calendar event
  return createCalendarEvent(token, eventDetails);
};