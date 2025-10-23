import { Text } from "@shopify/polaris";

export default function Features() {
  return (
    <div style={{ marginTop: "2rem" }}>
      <Text as="h4" variant="headingMd">Key Features</Text>
      <div style={{ marginTop: "1rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <Text as="h5" variant="headingSm">⏰ Advanced Countdown Timers</Text>
          <Text as="p" variant="bodyMd">Create stunning countdown timers with 4 different styles: Digital Clock, Flip Cards, Circular Progress, and Minimal. Fully customizable colors, animations, and responsive layouts.</Text>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <Text as="h5" variant="headingSm">🎯 Limited Time Offers</Text>
          <Text as="p" variant="bodyMd">Design spectacular limited-time offers with 4 unique styles: Spectacular (animated), Brutalist Bold, Glassmorphism, and Neumorphism. Perfect for flash sales and special promotions.</Text>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <Text as="h5" variant="headingSm">📦 Smart Stock Alerts</Text>
          <Text as="p" variant="bodyMd">Automatically display low stock warnings when inventory falls below your threshold. Customizable messages, colors, and animations to create urgency and inform customers.</Text>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <Text as="h5" variant="headingSm">⚠️ Scarcity Banners</Text>
          <Text as="p" variant="bodyMd">Add scarcity messaging with customizable banners featuring 3 unique styles: Spectacular (animated), Brutalist Bold, and Glassmorphism. Perfect for creating urgency and highlighting product scarcity.</Text>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <Text as="h5" variant="headingSm">🎨 Complete Customization</Text>
          <Text as="p" variant="bodyMd">Every element is fully customizable: colors, fonts, animations, positioning, and responsive behavior. Match your brand perfectly with our extensive styling options.</Text>
        </div>
      </div>
    </div>
  );
}


