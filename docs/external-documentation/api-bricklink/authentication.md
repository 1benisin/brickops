# Authentication & Authorization

## Make the request with OAuth protocol parameters

All requests to BrickLink REST API require you to authenticate using OAuth 1.0 like - but simpler flow. You can authorize your requests with your credentials provided after registration.

- The parameters are sent in either the HTTP Authorization header or query part of the URL with JSON format.
- All parameter names and values are escaped using the [RFC3986](http://tools.ietf.org/html/rfc3986) percent-encoding (%xx) mechanism.

## Parameter Details

| Property name          | Value  | Note                                                                                       |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------ |
| oauth_version          | String | Must be **1.0**                                                                            |
| oauth_consumer_key     | String | The consumer key                                                                           |
| oauth_token            | String | The access token                                                                           |
| oauth_timestamp        | String | The timestamp is expressed in the number of seconds since January 1, 1970 00:00:00 GMT     |
| oauth_nonce            | String | A random string, uniquely generated for each request                                       |
| oauth_signature_method | String | Must be **HMAC-SHA1**                                                                      |
| oauth_signature        | String | The signature as defined in [Signing Requests](http://oauth.net/core/1.0/#signing_process) |

## Example

The request for the orders you received is:

```
https://api.bricklink.com/api/store/v1/orders?direction=in

Authorization: OAuth realm="",
oauth_consumer_key="7CCDCEF257CF43D89A74A7E39BEAA1E1",
oauth_token="AC40C8C32A1748E0AE1EFA13CCCFAC3A",
oauth_signature_method="HMAC-SHA1",
oauth_signature="0IeNpR5N0kTEBURcuUMGTDPKU1c%3D",
oauth_timestamp="1191242096",
oauth_nonce="kllo9940pd9333jh",
oauth_version="1.0"
```

And if using query parameters:

```
https://api.bricklink.com/api/store/v1/orders?direction=in&Authorization=%7B%22oauth_signature%22%3A%22KVkfRqcGuEpqN7%252F57aLZVi9lS9k%3D%22%2C%22oauth_nonce%22%3A%22flBnl2yp3vk%22%2C%22oauth_version%22%3A%221.0%22%2C%22oauth_consumer_key%22%3A%227CCDCEF257CF43D89A74A7E39BEAA1E1%22%2C%22oauth_signature_method%22%3A%22HMAC-SHA1%22%2C%22oauth_token%22%3A%22AC40C8C32A1748E0AE1EFA13CCCFAC3A%22%2C%22oauth_timestamp%22%3A%221397119302%22%7D
```

You can verify the signature of the request on the link below:

- Online: [http://oauth.googlecode.com/svn/code/javascript/example/signature.html](http://oauth.googlecode.com/svn/code/javascript/example/signature.html)
- Java code: [BLAuthTest.zip](//static2.bricklink.com/api/BLAuthTest.zip)
