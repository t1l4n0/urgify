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
        direction?: 'row' | 'column' | 'block' | 'inline';
        alignItems?: string;
        justifyContent?: string;
      }, HTMLElement>;
      's-heading': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        level?: '1' | '2' | '3' | '4' | '5' | '6';
      }, HTMLElement>;
      's-paragraph': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        tone?: string;
        color?: string;
        type?: string;
        size?: string;
      }, HTMLElement>;
      's-box': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        padding?: string;
        paddingInlineStart?: string;
        paddingInlineEnd?: string;
        background?: string;
        borderWidth?: string;
        borderColor?: string;
        borderRadius?: string;
      }, HTMLElement>;
      's-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        href?: string;
        variant?: 'primary' | 'secondary' | 'tertiary';
        target?: string;
        tone?: string;
        type?: string;
        accessibilityLabel?: string;
        onClick?: React.MouseEventHandler<HTMLElement> | (() => void | Promise<void>);
        loading?: boolean;
        disabled?: boolean;
        commandFor?: string;
        command?: string;
        slot?: string;
      }, HTMLElement>;
      's-link': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        href?: string;
        target?: string;
      }, HTMLElement>;
      's-page': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        heading?: string;
      }, HTMLElement>;
      's-section': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        heading?: string;
        slot?: string;
      }, HTMLElement>;
      's-banner': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        tone?: 'critical' | 'warning' | 'success' | 'info';
        heading?: string;
        dismissible?: boolean;
        onDismiss?: () => void;
      }, HTMLElement>;
      's-ordered-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-ordered-list-item': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-unordered-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-unordered-list-item': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-spinner': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        size?: string;
      }, HTMLElement>;
      's-badge': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        tone?: string;
      }, HTMLElement>;
      's-text': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        tone?: string;
        color?: string;
        size?: string;
        emphasis?: string;
        slot?: string;
      }, HTMLElement>;
      's-modal': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        id?: string;
        heading?: string;
      }, HTMLElement>;
      's-choice-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        name?: string;
        value?: string;
        label?: string;
        values?: string[];
        onChange?: (e: any) => void;
      }, HTMLElement>;
      's-choice': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        value?: string;
        selected?: boolean;
      }, HTMLElement>;
      's-table': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-text-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
        value?: string;
        onChange?: (e: any) => void;
        type?: string;
        name?: string;
        placeholder?: string;
        autocomplete?: string;
        details?: string;
        error?: string;
      }, HTMLElement>;
      's-text-area': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
        value?: string;
        onChange?: (e: any) => void;
        name?: string;
        placeholder?: string;
        rows?: number;
        details?: string;
      }, HTMLElement>;
      's-grid': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        gap?: string;
        gridTemplateColumns?: string;
      }, HTMLElement>;
      's-checkbox': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
        checked?: boolean;
        onChange?: (e: any) => void;
      }, HTMLElement>;
      's-select': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
        value?: string;
        onChange?: (e: any) => void;
        details?: string;
      }, HTMLElement>;
      's-url-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
        value?: string;
        onChange?: (e: any) => void;
        autocomplete?: string;
        details?: string;
      }, HTMLElement>;
      's-drop-zone': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
        accept?: string;
        accessibilityLabel?: string;
        onChange?: (e: any) => void;
        onInput?: (e: any) => void;
        onDrop?: (e: any) => void;
        onDragOver?: (e: any) => void;
        disabled?: boolean;
        error?: string;
      }, HTMLElement>;
      's-image': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        width?: number;
        height?: number;
        inlineSize?: string;
        borderRadius?: string;
      }, HTMLElement>;
      's-number-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
        value?: number | string;
        onChange?: (e: any) => void;
        min?: number;
        max?: number;
        step?: number;
        details?: string;
      }, HTMLElement>;
      's-color-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
        value?: string;
        onChange?: (e: any) => void;
        autocomplete?: string;
        alpha?: boolean;
        details?: string;
      }, HTMLElement>;
      's-url-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
        value?: string;
        onChange?: (e: any) => void;
        autocomplete?: string;
        details?: string;
      }, HTMLElement>;
      's-option': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        value?: string;
      }, HTMLElement>;
      // App Bridge UI Components
      'ui-save-bar': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        showing?: boolean;
        id?: string;
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
