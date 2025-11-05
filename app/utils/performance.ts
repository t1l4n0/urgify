// Performance monitoring utilities for Shopify apps
export interface PerformanceMetrics {
  timestamp: number;
  route: string;
  loadTime: number;
  bundleSize?: number;
  apiCalls: number;
  apiResponseTime: number;
  memoryUsage?: number;
  userAgent: string;
  shop?: string;
}

export interface BundleMetrics {
  totalSize: number;
  gzipSize: number;
  brotliSize: number;
  chunks: Array<{
    name: string;
    size: number;
    gzipSize: number;
    brotliSize: number;
  }>;
  largestChunks: Array<{
    name: string;
    size: number;
    percentage: number;
  }>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 1000; // Keep last 1000 metrics

  // Track page load performance
  trackPageLoad(route: string, loadTime: number, shop?: string) {
    const metric: PerformanceMetrics = {
      timestamp: Date.now(),
      route,
      loadTime,
      apiCalls: 0,
      apiResponseTime: 0,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      shop,
    };

    this.metrics.push(metric);
    this.cleanup();
    
    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`📊 Performance: ${route} loaded in ${loadTime}ms`);
    }
  }

  // Track API call performance
  trackApiCall(route: string, responseTime: number, shop?: string) {
    const latestMetric = this.metrics[this.metrics.length - 1];
    if (latestMetric && latestMetric.route === route) {
      latestMetric.apiCalls++;
      latestMetric.apiResponseTime = Math.max(latestMetric.apiResponseTime, responseTime);
    }

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔗 API Call: ${route} responded in ${responseTime}ms`);
    }
  }

  // Get performance summary
  getPerformanceSummary(): {
    averageLoadTime: number;
    slowestRoutes: Array<{ route: string; loadTime: number }>;
    totalApiCalls: number;
    averageApiResponseTime: number;
  } {
    if (this.metrics.length === 0) {
      return {
        averageLoadTime: 0,
        slowestRoutes: [],
        totalApiCalls: 0,
        averageApiResponseTime: 0,
      };
    }

    const totalLoadTime = this.metrics.reduce((sum, m) => sum + m.loadTime, 0);
    const averageLoadTime = totalLoadTime / this.metrics.length;

    const slowestRoutes = this.metrics
      .sort((a, b) => b.loadTime - a.loadTime)
      .slice(0, 5)
      .map(m => ({ route: m.route, loadTime: m.loadTime }));

    const totalApiCalls = this.metrics.reduce((sum, m) => sum + m.apiCalls, 0);
    const totalApiResponseTime = this.metrics.reduce((sum, m) => sum + m.apiResponseTime, 0);
    const averageApiResponseTime = totalApiCalls > 0 ? totalApiResponseTime / totalApiCalls : 0;

    return {
      averageLoadTime,
      slowestRoutes,
      totalApiCalls,
      averageApiResponseTime,
    };
  }

  // Get metrics for a specific route
  getRouteMetrics(route: string): PerformanceMetrics[] {
    return this.metrics.filter(m => m.route === route);
  }

  // Get all metrics (for debugging)
  getAllMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  // Cleanup old metrics
  private cleanup() {
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  // Clear all metrics
  clear() {
    this.metrics = [];
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Bundle analysis utilities
export function analyzeBundleSize(buildOutput: string): BundleMetrics {
  // This would typically parse the build output
  // For now, return a mock structure
  return {
    totalSize: 0,
    gzipSize: 0,
    brotliSize: 0,
    chunks: [],
    largestChunks: [],
  };
}

// Core Web Vitals tracking
export function trackCoreWebVitals() {
  if (typeof window === 'undefined') return;

    // Track Largest Contentful Paint (LCP)
    if ('PerformanceObserver' in window) {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (process.env.NODE_ENV === 'development') {
          console.log('📊 LCP:', lastEntry.startTime);
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // Track First Input Delay (FID)
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 FID:', entry.processingStart - entry.startTime);
          }
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Track Cumulative Layout Shift (CLS)
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        if (process.env.NODE_ENV === 'development') {
          console.log('📊 CLS:', clsValue);
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    }
}

// Performance middleware for Remix
export function withPerformanceTracking<T extends any[], R>(
  target: (...args: T) => Promise<R>,
  routeName: string
) {
  return async function (this: any, ...args: T): Promise<R> {
    const startTime = Date.now();
    
    try {
      const result = await target.apply(this, args);
      const loadTime = Date.now() - startTime;
      
      performanceMonitor.trackPageLoad(routeName, loadTime);
      
      return result;
    } catch (error) {
      const loadTime = Date.now() - startTime;
      performanceMonitor.trackPageLoad(routeName, loadTime);
      throw error;
    }
  };
}

// API performance tracking
export function trackApiPerformance<T extends any[], R>(
  target: (...args: T) => Promise<R>,
  apiName: string
) {
  return async function (this: any, ...args: T): Promise<R> {
    const startTime = Date.now();
    
    try {
      const result = await target.apply(this, args);
      const responseTime = Date.now() - startTime;
      
      performanceMonitor.trackApiCall(apiName, responseTime);
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      performanceMonitor.trackApiCall(apiName, responseTime);
      throw error;
    }
  };
}

// Performance dashboard data
export function getPerformanceDashboard() {
  const summary = performanceMonitor.getPerformanceSummary();
  const allMetrics = performanceMonitor.getAllMetrics();
  
  return {
    summary,
    totalRequests: allMetrics.length,
    recentMetrics: allMetrics.slice(-10),
    performanceScore: calculatePerformanceScore(summary),
  };
}

// Calculate performance score (0-100)
function calculatePerformanceScore(summary: ReturnType<typeof performanceMonitor.getPerformanceSummary>): number {
  let score = 100;
  
  // Deduct points for slow load times
  if (summary.averageLoadTime > 2000) score -= 30;
  else if (summary.averageLoadTime > 1000) score -= 15;
  else if (summary.averageLoadTime > 500) score -= 5;
  
  // Deduct points for slow API responses
  if (summary.averageApiResponseTime > 1000) score -= 20;
  else if (summary.averageApiResponseTime > 500) score -= 10;
  else if (summary.averageApiResponseTime > 200) score -= 5;
  
  return Math.max(0, score);
}
