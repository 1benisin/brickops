# Error Handling

## Result Code

Errors are returned using standard HTTP error code syntax. Any additional info is JSON-formatted and included in the body of the return call.

- A value of 2xx indicates that no errors occurred, and the transaction was successful.
- A value other than 2xx indicates an error.

| Code | Message                      | Description                                                                                                                                                  |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 200  | OK                           | A request has been successfully fulfilled.                                                                                                                   |
| 201  | OK_CREATED                   | A request has been successfully fulfilled and resulted in a creation of a new resource.                                                                      |
| 204  | OK_NO_CONTENT                | A request has been successfully processed but does not need to return any data.                                                                              |
| 400  | INVALID_URI                  | A request has been made to a malformed URL.                                                                                                                  |
| 400  | INVALID_REQUEST_BODY         | A request has been made with a malformed JSON body.                                                                                                          |
| 400  | PARAMETER_MISSING_OR_INVALID | One of the parameters specified is invalid or missing.                                                                                                       |
| 401  | BAD_OAUTH_REQUEST            | Bad OAuth request (wrong consumer key, bad nonce, expired timestamp, etc.). Error message should indicate which one and why.                                 |
| 403  | PERMISSION_DENIED            | The user is not permitted to make the given request.                                                                                                         |
| 404  | RESOURCE_NOT_FOUND           | The resource you requested does not exist.                                                                                                                   |
| 405  | METHOD_NOT_ALLOWED           | The request method is not permitted.                                                                                                                         |
| 415  | UNSUPPORTED_MEDIA_TYPE       | The server refused to service the request because the entity of the request is in a format not supported by the requested resource for the requested method. |
| 422  | RESOURCE_UPDATE_NOT_ALLOWED  | Your post/put request was denied (attempt to update an order status to unavailable value...).                                                                |
| 500  | INTERNAL_SERVER_ERROR        | An unexpected error has occurred in the API.                                                                                                                 |
