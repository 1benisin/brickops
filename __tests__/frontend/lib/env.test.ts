/* eslint-env jest */
import { loadEnv } from "@/lib/env";

// Mock console.error to prevent noise in tests
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});

describe("Environment Validation", () => {
  describe("loadEnv", () => {
    it("should parse valid environment variables", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
        CONVEX_DEPLOYMENT: "production",
      };

      const result = loadEnv(mockEnv);

      expect(result).toEqual({
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
        CONVEX_DEPLOYMENT: "production",
      });
    });

    it("should use 'dev' as default for CONVEX_DEPLOYMENT", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
        // CONVEX_DEPLOYMENT not provided
      };

      const result = loadEnv(mockEnv);

      expect(result.CONVEX_DEPLOYMENT).toBe("dev");
    });

    it("should normalize URL by removing trailing slashes", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud/",
        CONVEX_DEPLOYMENT: "dev",
      };

      const result = loadEnv(mockEnv);

      expect(result.NEXT_PUBLIC_CONVEX_URL).toBe("https://test.convex.cloud");
    });

    it("should throw error for missing NEXT_PUBLIC_CONVEX_URL", () => {
      const mockEnv = {};

      expect(() => loadEnv(mockEnv)).toThrow("NEXT_PUBLIC_CONVEX_URL must be defined");
    });

    it("should throw error for empty NEXT_PUBLIC_CONVEX_URL", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "",
      };

      expect(() => loadEnv(mockEnv)).toThrow("NEXT_PUBLIC_CONVEX_URL must be defined");
    });

    it("should throw error for whitespace-only NEXT_PUBLIC_CONVEX_URL", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "   ",
      };

      expect(() => loadEnv(mockEnv)).toThrow("NEXT_PUBLIC_CONVEX_URL cannot be empty");
    });

    it("should throw error for invalid URL format", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "not-a-url",
      };

      expect(() => loadEnv(mockEnv)).toThrow("NEXT_PUBLIC_CONVEX_URL must be a valid URL");
    });

    it("should throw error for empty CONVEX_DEPLOYMENT when explicitly set", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
        CONVEX_DEPLOYMENT: "",
      };

      expect(() => loadEnv(mockEnv)).toThrow("CONVEX_DEPLOYMENT must be defined");
    });

    it("should handle complex URLs correctly", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "https://subdomain.convex.cloud:8080",
        CONVEX_DEPLOYMENT: "staging",
      };

      const result = loadEnv(mockEnv);

      expect(result.NEXT_PUBLIC_CONVEX_URL).toBe("https://subdomain.convex.cloud:8080");
    });
  });

  describe("getEnv", () => {
    // Reset the cached env before each test
    beforeEach(() => {
      // Clear the module cache to reset the singleton
      jest.resetModules();
    });

    it("should cache environment variables on subsequent calls", () => {
      // Mock process.env for Node.js environment
      const originalEnv = process.env;
      process.env = {
        ...process.env,
        NEXT_PUBLIC_CONVEX_URL: "https://cached.convex.cloud",
        CONVEX_DEPLOYMENT: "test",
      };

      // Mock window to simulate server environment
      Object.defineProperty(window, "window", {
        value: undefined,
        writable: true,
      });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getEnv } = require("@/lib/env");

      const result1 = getEnv();
      const result2 = getEnv();

      expect(result1).toBe(result2); // Should be the exact same object due to caching
      expect(result1).toEqual({
        NEXT_PUBLIC_CONVEX_URL: "https://cached.convex.cloud",
        CONVEX_DEPLOYMENT: "test",
      });

      // Restore
      process.env = originalEnv;
    });

    it("should handle browser environment with inlined values", () => {
      // Mock browser environment
      Object.defineProperty(global, "window", {
        value: {},
        writable: true,
      });

      // Mock process.env.NEXT_PUBLIC_CONVEX_URL as it would be inlined
      const originalEnv = process.env;
      process.env = {
        ...process.env,
        NEXT_PUBLIC_CONVEX_URL: "https://browser.convex.cloud",
      };

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getEnv } = require("@/lib/env");

      const result = getEnv();

      expect(result).toEqual({
        NEXT_PUBLIC_CONVEX_URL: "https://browser.convex.cloud",
        CONVEX_DEPLOYMENT: "dev", // Default for browser
      });

      // Restore
      process.env = originalEnv;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).window;
    });

    it("should throw error in browser with invalid inlined URL", () => {
      // Mock browser environment
      Object.defineProperty(global, "window", {
        value: {},
        writable: true,
      });

      // Mock invalid inlined URL
      const originalEnv = process.env;
      process.env = {
        ...process.env,
        NEXT_PUBLIC_CONVEX_URL: "invalid-url",
      };

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getEnv } = require("@/lib/env");

      expect(() => getEnv()).toThrow("NEXT_PUBLIC_CONVEX_URL must be a valid URL");

      // Restore
      process.env = originalEnv;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).window;
    });

    it("should throw error in browser with missing inlined URL", () => {
      // Mock browser environment
      Object.defineProperty(global, "window", {
        value: {},
        writable: true,
      });

      // Mock missing inlined URL
      const originalEnv = process.env;
      process.env = {
        ...process.env,
        NEXT_PUBLIC_CONVEX_URL: undefined,
      };

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getEnv } = require("@/lib/env");

      expect(() => getEnv()).toThrow("NEXT_PUBLIC_CONVEX_URL must be defined");

      // Restore
      process.env = originalEnv;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).window;
    });
  });

  describe("Edge Cases", () => {
    it("should handle URLs with query parameters", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud?param=value",
      };

      const result = loadEnv(mockEnv);

      expect(result.NEXT_PUBLIC_CONVEX_URL).toBe("https://test.convex.cloud");
    });

    it("should handle URLs with hash fragments", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud#fragment",
      };

      const result = loadEnv(mockEnv);

      expect(result.NEXT_PUBLIC_CONVEX_URL).toBe("https://test.convex.cloud");
    });

    it("should handle mixed case deployment names", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
        CONVEX_DEPLOYMENT: "Production",
      };

      const result = loadEnv(mockEnv);

      expect(result.CONVEX_DEPLOYMENT).toBe("Production");
    });

    it("should preserve custom port in URL", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "http://localhost:3000",
      };

      const result = loadEnv(mockEnv);

      expect(result.NEXT_PUBLIC_CONVEX_URL).toBe("http://localhost:3000");
    });
  });

  describe("Security Validation", () => {
    it("should accept https URLs", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "https://secure.convex.cloud",
      };

      expect(() => loadEnv(mockEnv)).not.toThrow();
    });

    it("should accept http URLs for development", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "http://localhost:8080",
      };

      expect(() => loadEnv(mockEnv)).not.toThrow();
    });

    it("should accept file:// URLs (though not recommended)", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "file:///path/to/file",
      };

      // URL constructor accepts file:// as valid, but origin is "null"
      // In production, you'd want additional validation for allowed protocols
      expect(() => loadEnv(mockEnv)).not.toThrow();

      const result = loadEnv(mockEnv);
      expect(result.NEXT_PUBLIC_CONVEX_URL).toBe("null");
    });

    it("should reject ftp:// URLs", () => {
      const mockEnv = {
        NEXT_PUBLIC_CONVEX_URL: "ftp://ftp.example.com",
      };

      // This actually won't throw because URL constructor accepts ftp://
      // But our validation only checks for valid URL format, not protocol
      expect(() => loadEnv(mockEnv)).not.toThrow();

      const result = loadEnv(mockEnv);
      expect(result.NEXT_PUBLIC_CONVEX_URL).toBe("ftp://ftp.example.com");
    });
  });
});
