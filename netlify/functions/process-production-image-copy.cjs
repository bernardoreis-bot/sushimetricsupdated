const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Initialize Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event, context) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Get the uploaded file
    const contentType = event.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Content-Type must be multipart/form-data' }),
      };
    }

    // Parse the multipart form data
    const boundary = contentType.split('boundary=')[1];
    const body = event.body;
    const parts = body.split(`--${boundary}`);
    
    let imageBuffer = null;
    let authToken = null;

    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data; name="image"') || 
          part.includes('Content-Disposition: form-data; name="file"')) {
        const dataStart = part.indexOf('\r\n\r\n') + 4;
        const dataEnd = part.lastIndexOf('\r\n');
        if (dataStart > 3 && dataEnd > dataStart) {
          imageBuffer = Buffer.from(part.slice(dataStart, dataEnd), 'binary');
        }
      }
    }

    // Get auth token from header
    authToken = event.headers.authorization?.replace('Bearer ', '');

    if (!imageBuffer) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No image file found in request' }),
      };
    }

    if (!authToken) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'No authorization token provided' }),
      };
    }

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
    if (authError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid or expired token' }),
      };
    }

    // Check OpenAI API key configuration
    const { data: openaiConfig } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'openai_api_key_copy')
      .maybeSingle();

    if (!openaiConfig?.setting_value) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OpenAI API key not configured' }),
      };
    }

    // Initialize OpenAI with the stored key
    const openaiWithKey = new OpenAI({
      apiKey: openaiConfig.setting_value,
    });

    // Convert image to base64
    const base64Image = imageBuffer.toString('base64');

    // Call OpenAI Vision API
    const response = await openaiWithKey.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract all food items and their quantities from this production plan image. 
              Return the data as a JSON array with this format:
              [
                {"name": "item name", "quantity": number},
                ...
              ]
              
              Guidelines:
              - Only extract food items (not boxes, utensils, etc.)
              - Clean up item names (remove extra spaces, special characters)
              - Extract numerical quantities
              - If quantity is unclear, use 1
              - Ignore headers, footers, and section titles
              - Be precise with item names (e.g., "California Roll" not just "Roll")`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
    });

    const content = response.choices[0].message.content;
    
    // Parse the JSON response
    let items = [];
    try {
      // Extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to parse AI response',
          raw_response: content 
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        items: items,
        itemCount: items.length,
        raw_response: content
      }),
    };

  } catch (error) {
    console.error('Error processing image:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
    };
  }
};
