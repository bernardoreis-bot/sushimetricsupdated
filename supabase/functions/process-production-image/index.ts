import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProductionItem {
  productName: string;
  quantity: number;
  category?: string;
}

interface ErrorDetail {
  code: string;
  message: string;
  solution: string;
  technical: string;
}

function createDetailedError(error: any, context: string): ErrorDetail {
  console.error(`[${context}]`, error);

  if (error.message?.includes("OPENAI_API_KEY not configured")) {
    return {
      code: "OPENAI_KEY_MISSING",
      message: "OpenAI API key is not configured in the system",
      solution: "Please contact your administrator to configure the OPENAI_API_KEY environment variable in Supabase Edge Functions settings",
      technical: "Environment variable OPENAI_API_KEY is not set"
    };
  }

  if (error.message?.includes("Incorrect API key") || error.message?.includes("401")) {
    return {
      code: "OPENAI_KEY_INVALID",
      message: "The OpenAI API key is invalid or has been revoked",
      solution: "Please verify your API key at https://platform.openai.com/api-keys and update it in the system settings",
      technical: `API returned 401: ${error.message}`
    };
  }

  if (error.message?.includes("quota") || error.message?.includes("429")) {
    return {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests to OpenAI API or quota exceeded",
      solution: "Please wait a moment and try again. If the issue persists, check your OpenAI usage limits at https://platform.openai.com/usage",
      technical: `API returned 429: Rate limit or quota exceeded`
    };
  }

  if (error.message?.includes("NetworkError") || error.name === "NetworkError") {
    return {
      code: "NETWORK_ERROR",
      message: "Network connection to OpenAI API failed",
      solution: "Check your internet connection and try again. The issue may be temporary.",
      technical: `Network error: ${error.message}`
    };
  }

  if (error.message?.includes("timeout")) {
    return {
      code: "TIMEOUT",
      message: "Request to OpenAI API timed out",
      solution: "The image may be too large or the API is slow. Try with a smaller/clearer image.",
      technical: `Timeout after waiting for API response`
    };
  }

  if (error.message?.includes("Failed to parse")) {
    return {
      code: "PARSING_ERROR",
      message: "Could not extract structured data from the image",
      solution: "The image may be unclear or not contain a proper table. Try with a clearer photo or use the fallback OCR option.",
      technical: error.message
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "An unexpected error occurred during image processing",
    solution: "Please try again. If the issue persists, try using the fallback OCR option or contact support.",
    technical: error.message || String(error)
  };
}

async function verifyOpenAIConnection(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      }
    });

    if (response.ok) {
      return { valid: true };
    }

    const errorData = await response.text();
    return { valid: false, error: `Status ${response.status}: ${errorData}` };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  let attemptCount = 0;
  const maxAttempts = 2;

  try {
    // Try to get API key from environment, fallback to database
    let openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    // If not in environment, fetch from database
    if (!openaiApiKey) {
      console.log("OPENAI_API_KEY not in environment, fetching from database...");
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const dbResponse = await fetch(`${supabaseUrl}/rest/v1/app_settings?setting_key=eq.openai_api_key&select=setting_value`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });

        if (dbResponse.ok) {
          const data = await dbResponse.json();
          if (data && data.length > 0 && data[0].setting_value) {
            openaiApiKey = data[0].setting_value;
            console.log("✓ OpenAI API key loaded from database");
          }
        }
      } catch (dbError) {
        console.error("Error fetching API key from database:", dbError);
      }
    }

    if (!openaiApiKey) {
      const errorDetail = createDetailedError(
        new Error("OPENAI_API_KEY not configured"),
        "API Key Check"
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: errorDetail.message,
          errorCode: errorDetail.code,
          solution: errorDetail.solution,
          technical: errorDetail.technical,
          useFallback: true
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    console.log("Verifying OpenAI API connection...");
    const connectionCheck = await verifyOpenAIConnection(openaiApiKey);

    if (!connectionCheck.valid) {
      const errorDetail = createDetailedError(
        new Error(`API_KEY_INVALID: ${connectionCheck.error}`),
        "Connection Verification"
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: errorDetail.message,
          errorCode: errorDetail.code,
          solution: errorDetail.solution,
          technical: errorDetail.technical,
          useFallback: true
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const formData = await req.formData();
    const imageFile = formData.get("image") as File;

    if (!imageFile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No image file provided",
          errorCode: "NO_IMAGE",
          solution: "Please select an image file and try again",
          technical: "FormData does not contain 'image' field"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    console.log(`Processing image: ${imageFile.name}, size: ${imageFile.size} bytes, type: ${imageFile.type}`);

    const imageBytes = await imageFile.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBytes)));

    const prompt = `Analyze this production plan table image carefully and extract ALL items with their quantities.

The image shows a "Boxes required for Production" table with multiple categories like:
- Sides and Snacks
- Variety bentos
- Selection Boxes
- Gyoza and Bites
- Signature Set
- Sharers
- Ready Meals
- Classic Rolls
- Specialty Rolls

For EACH item you find, return it in this exact JSON format:
{
  "items": [
    {"productName": "Exact Product Name", "quantity": number, "category": "Category Name"}
  ]
}

Rules:
1. Extract EVERY product and its number from the table
2. Keep product names EXACTLY as shown (with proper capitalization)
3. Include the category for each item
4. If you see "Chilli" keep the spelling exactly as shown
5. Return ONLY valid JSON, no markdown or explanations
6. Extract ALL items - do not skip any rows`;

    let openaiResponse;
    let lastError;

    for (attemptCount = 1; attemptCount <= maxAttempts; attemptCount++) {
      try {
        console.log(`Attempt ${attemptCount}/${maxAttempts}: Sending request to OpenAI API...`);

        openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: prompt
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${imageFile.type};base64,${base64Image}`
                    }
                  }
                ]
              }
            ],
            max_tokens: 2000,
            temperature: 0.1
          })
        });

        if (openaiResponse.ok) {
          console.log(`Attempt ${attemptCount}: Success!`);
          break;
        }

        const errorText = await openaiResponse.text();
        lastError = new Error(`Status ${openaiResponse.status}: ${errorText}`);
        console.error(`Attempt ${attemptCount} failed:`, lastError);

        if (openaiResponse.status === 429 && attemptCount < maxAttempts) {
          console.log("Rate limited, waiting 2 seconds before retry...");
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        throw lastError;

      } catch (err) {
        lastError = err;
        if (attemptCount < maxAttempts) {
          console.log(`Attempt ${attemptCount} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    if (!openaiResponse || !openaiResponse.ok) {
      const errorDetail = createDetailedError(lastError, "OpenAI API Request");

      return new Response(
        JSON.stringify({
          success: false,
          error: errorDetail.message,
          errorCode: errorDetail.code,
          solution: errorDetail.solution,
          technical: errorDetail.technical,
          attempts: attemptCount,
          useFallback: true
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const openaiData = await openaiResponse.json();
    const responseText = openaiData.choices?.[0]?.message?.content || "";

    console.log("Raw OpenAI response:", responseText.substring(0, 200));

    let parsedItems: ProductionItem[] = [];

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[0]);
        parsedItems = jsonData.items || [];
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      const errorDetail = createDetailedError(parseError, "JSON Parsing");

      return new Response(
        JSON.stringify({
          success: false,
          error: errorDetail.message,
          errorCode: errorDetail.code,
          solution: errorDetail.solution,
          technical: errorDetail.technical,
          rawResponse: responseText,
          useFallback: true
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const processingTime = Date.now() - startTime;
    console.log(`Successfully extracted ${parsedItems.length} items in ${processingTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        items: parsedItems,
        rawText: responseText,
        itemCount: parsedItems.length,
        processingTime,
        attempts: attemptCount
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {
    const errorDetail = createDetailedError(error, "General Error");

    return new Response(
      JSON.stringify({
        success: false,
        error: errorDetail.message,
        errorCode: errorDetail.code,
        solution: errorDetail.solution,
        technical: errorDetail.technical,
        useFallback: true
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});