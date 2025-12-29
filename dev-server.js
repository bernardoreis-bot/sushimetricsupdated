import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const app = express();
const port = 9999;

// Middleware to parse JSON
app.use(express.json());

// Function to execute a Netlify function
async function executeFunction(functionName, event) {
  const functionPath = path.join(process.cwd(), 'netlify', 'functions', `${functionName}.js`);
  
  if (!fs.existsSync(functionPath)) {
    throw new Error(`Function ${functionName} not found`);
  }
  
  // Clear require cache to get fresh module
  delete require.cache[require.resolve(functionPath)];
  
  const handler = require(functionPath).handler;
  
  // Create a mock context
  const context = {
    functionName,
    functionVersion: '1.0',
    invokedFunctionArn: `arn:aws:lambda:us-east-1:123456789012:function:${functionName}`,
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: `/aws/lambda/${functionName}`,
    logStreamName: '2023/01/01/[$LATEST]test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: (error, response) => {},
    fail: (error) => {},
    succeed: (response) => {},
    callbackWaitsForEmptyEventLoop: false
  };
  
  try {
    const response = await handler(event, context);
    return response;
  } catch (error) {
    console.error(`Error executing function ${functionName}:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}

// Proxy all function requests
app.post('/.netlify/functions/:functionName', async (req, res) => {
  const functionName = req.params.functionName;
  
  try {
    console.log(`Executing function: ${functionName}`, req.body);
    
    const event = {
      body: JSON.stringify(req.body),
      httpMethod: 'POST',
      headers: req.headers,
      path: `/.netlify/functions/${functionName}`,
      queryStringParameters: null,
      isBase64Encoded: false
    };
    
    const response = await executeFunction(functionName, event);
    
    // Set headers from the function response
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.set(key, value);
      });
    }
    
    // Send the response
    res.status(response.statusCode || 200);
    
    if (response.body) {
      if (typeof response.body === 'string') {
        res.send(response.body);
      } else {
        res.json(response.body);
      }
    } else {
      res.end();
    }
  } catch (error) {
    console.error(`Error in function ${functionName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Netlify functions server running on port ${port}`);
});
