Batch multiple requests together into one bulk request to save on request overhead

### Batch

POST https://api.brickowl.com/v1/bulk/batch

Batch up to 50 requests in one go

##### Arguments

- requests - JSON Array of endpoints with arguments in the format {"requests": \[{"endpoint":"catalog/search","request_method":"GET","params":\[{"query":"Vendor"}\]}, {"endpoint":"catalog/search","request_method":"GET","params":\[{"query":"Laser"}\]}\]}. Or for POST {"requests": \[{"endpoint":"inventory/update","request_method":"POST","params":\[{"lot_id":"IDHERE","absolute_quantity":2}\]}\]}

---
