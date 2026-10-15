export function BuilderCard() {
  return (
    <section className="card builder-card" aria-labelledby="builder-title">
      <p className="eyebrow">BUILT BY</p>
      <svg
        viewBox="100 130 750 250"
        role="img"
        aria-label="kasiAIhub — Intelligent Business Systems"
        className="builder-logo"
      >
        <image href="/images/kasiaihub-reference.png" width="941" height="1672" />
      </svg>
      <h2 id="builder-title">kasiAIhub</h2>
      <p>Building business systems for kasi entrepreneurs.</p>
      <div className="builder-contact">
        <p>Thandi Dlamini</p>
        <a href="tel:+27820000000">082 000 0000</a>
        <a href="https://kasiaihub.com" target="_blank" rel="noopener noreferrer">
          kasiaihub.com
        </a>
      </div>
      <div className="builder-actions">
        <a
          className="button"
          href={`https://wa.me/+27820000000?text=${encodeURIComponent('Hi Thandi, I’m contacting you from KASI KOTA.')}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp us
        </a>
        <a
          className="button secondary"
          href="https://kasiaihub.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit website
        </a>
      </div>
    </section>
  );
}
