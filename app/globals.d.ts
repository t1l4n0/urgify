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

  // Shopify Web Components types
  namespace JSX {
    interface IntrinsicElements {
      's-stack': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        gap?: 'tight' | 'base' | 'loose';
        direction?: 'row' | 'column';
      }, HTMLElement>;
      's-heading': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        level?: '1' | '2' | '3' | '4' | '5' | '6';
      }, HTMLElement>;
      's-paragraph': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-box': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        href?: string;
        variant?: 'primary' | 'secondary' | 'tertiary';
        target?: string;
      }, HTMLElement>;
      's-page': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        heading?: string;
      }, HTMLElement>;
      's-section': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-banner': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        tone?: 'critical' | 'warning' | 'success' | 'info';
        heading?: string;
      }, HTMLElement>;
    }
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
