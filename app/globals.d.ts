declare module "*.css";

// Shopify App Bridge v4 global types
declare global {
  interface Window {
    shopify?: {
      reviews?: {
        request(): Promise<ReviewRequestResponse>;
      };
    };
  }
}

// Strict typing for Shopify Reviews API
export type ReviewResultCode = 
  | 'already-reviewed'
  | 'cooldown-period' 
  | 'annual-limit-reached'
  | 'recently-installed'
  | 'mobile-app'
  | 'merchant-ineligible'
  | 'already-open'
  | 'open-in-progress'
  | 'cancelled';

export interface ReviewRequestSuccessResponse {
  success: true;
  code: 'success';
  message: 'Review modal shown successfully';
}

export interface ReviewRequestDeclinedResponse {
  success: false;
  code: ReviewResultCode;
  message: string;
}

export type ReviewRequestResponse = ReviewRequestSuccessResponse | ReviewRequestDeclinedResponse;
