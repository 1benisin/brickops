To access the API you first need an [API Key](/user/2933999/api_keys). Once you have the API key you can make a request to any of the methods listed below that your key has permission for. The API is rated limited to 600 requests per minute for most requests, or 200 requests per minute for bulk/batch.

For `GET` request the key and any parameters should be added as parameters onto the request, for example https://api.brickowl.com/v1/order/view?key=KEY&order\_id=100.  
For `POST` requests, the key and any parameters should be in the body of the request and have a content type of `application/x-www-form-urlencoded`

If you are making a tool, it may be helpful to know that you can provide a link to any item in the catalog with the URL format https://www.brickowl.com/boid/BOIDHERE.
