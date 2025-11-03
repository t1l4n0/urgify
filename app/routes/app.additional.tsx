export default function AdditionalPage() {
  return (
    <s-page heading="Additional page">
      <s-section>
        <s-stack gap="base" direction="block">
          <s-paragraph>
            The app template comes with an additional page which
            demonstrates how to create multiple pages within app navigation
            using{" "}
            <s-link
              href="https://shopify.dev/docs/apps/tools/app-bridge"
              target="_blank"
            >
              App Bridge
            </s-link>
            .
          </s-paragraph>
          <s-paragraph>
            To create your own page and have it show up in the app
            navigation, add a page inside <Code>app/routes</Code>, and a
            link to it in the <Code>&lt;NavMenu&gt;</Code> component found
            in <Code>app/routes/app.jsx</Code>.
          </s-paragraph>
        </s-stack>
      </s-section>
      
      <s-section heading="Resources" slot="aside">
        <s-unordered-list>
          <s-unordered-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
              target="_blank"
            >
              App nav best practices
            </s-link>
          </s-unordered-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <s-box
      padding="small"
      paddingInlineStart="base"
      paddingInlineEnd="base"
      background="subdued"
      borderWidth="small"
      borderColor="base"
      borderRadius="base"
    >
      <code>{children}</code>
    </s-box>
  );
}
