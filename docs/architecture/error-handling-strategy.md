# Error Handling Strategy

- Structured error objects with codes and user-friendly messages
- External API errors: exponential backoff with jitter, circuit breakers, and timeout configuration
- Data consistency: transactional mutations, idempotency keys for external calls

```typescript
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId: string;
  };
}
```
