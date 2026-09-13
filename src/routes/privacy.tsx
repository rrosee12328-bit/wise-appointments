import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy - Jey Link" },
      {
        name: "description",
        content: "How Jey Link collects, uses, and protects personal information.",
      },
    ],
  }),
  component: PrivacyPolicy,
});

const sections = [
  {
    title: "Information we collect",
    paragraphs: [
      "We collect account information such as your name, email address, authentication details, profile settings, and support communications.",
      "When you connect a calendar or scheduling service, Jey Link processes the calendar, appointment, client, service, availability, and connection information needed to display and synchronize your schedule. Connected services may provide access tokens that let Jey Link maintain the connection you authorized.",
      "We also process subscription status and billing identifiers. Payment card details are handled by Apple, Google, or Stripe and are not stored by Jey Link. We may collect limited device, diagnostic, and usage information needed to operate, secure, and improve the service.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: [
      "We use information to create and secure your account; connect and synchronize calendars and scheduling platforms; display, create, and update appointments; prevent scheduling conflicts; provide notifications, subscriptions, and customer support; troubleshoot errors; and comply with legal obligations.",
      "Jey Link does not use your calendar or appointment data for third-party advertising and does not sell your personal information.",
    ],
  },
  {
    title: "How we share information",
    paragraphs: [
      "We share information only as needed with services that help us operate Jey Link, including cloud hosting, authentication, database, email, analytics and error-monitoring, payment, subscription, and connected calendar or scheduling providers. These providers process information for the services they perform for us.",
      "We may also disclose information when required by law, to protect users or the service, or as part of a business transfer. We do not share personal information with data brokers or third parties for their own advertising purposes.",
    ],
  },
  {
    title: "Data retention and deletion",
    paragraphs: [
      "We retain information while your account is active and as reasonably necessary to provide the service, resolve disputes, maintain security, and meet legal obligations. Disconnecting a platform stops future synchronization with that platform.",
      "You may request access, correction, export, or deletion of your personal information by contacting us. Some records may be retained when required by law or for legitimate security, fraud-prevention, or accounting purposes.",
    ],
  },
  {
    title: "Security",
    paragraphs: [
      "We use administrative, technical, and organizational safeguards designed to protect personal information. No storage or transmission method is completely secure, so we cannot guarantee absolute security.",
    ],
  },
  {
    title: "Children",
    paragraphs: [
      "Jey Link is a professional scheduling service and is not directed to children under 13. We do not knowingly collect personal information from children under 13. Contact us if you believe a child has provided personal information to Jey Link.",
    ],
  },
  {
    title: "Changes to this policy",
    paragraphs: [
      "We may update this policy as Jey Link changes. We will post the revised policy here and update the effective date. Material changes may also be communicated through the app or by email.",
    ],
  },
];

function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Jey Link</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective September 13, 2026</p>
      </header>

      <div className="space-y-8 py-8">
        <p className="text-sm leading-7 text-foreground">
          This Privacy Policy explains how Jey Link collects, uses, discloses, and protects
          information when you use our website, mobile applications, and scheduling services.
        </p>

        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
            <div className="mt-2 space-y-3">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-7 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h2 className="text-lg font-semibold text-foreground">Contact us</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            Questions or privacy requests can be sent to{" "}
            <a className="font-medium text-accent underline" href="mailto:support@jeylink.co">
              support@jeylink.co
            </a>
            . You can also visit our{" "}
            <Link className="font-medium text-accent underline" to="/support">
              support page
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
