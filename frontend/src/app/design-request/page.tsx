"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiRequest, readableError } from "@/lib/api";

type DesignResponse = {
  reference: string;
  status: string;
  title: string;
  estimated_price: string | null;
  estimated_production_days: number | null;
};

export default function DesignRequestPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [height, setHeight] = useState("");
  const [materials, setMaterials] = useState("");
  const [finish, setFinish] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DesignResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const dimensions: Record<string, string> = {};
      if (width.trim()) dimensions.width = width.trim();
      if (depth.trim()) dimensions.depth = depth.trim();
      if (height.trim()) dimensions.height = height.trim();

      const response = await apiRequest<DesignResponse>(
        "/design-requests/",
        {
          method: "POST",
          body: JSON.stringify({
            customer_name: name.trim(),
            customer_phone: phone.trim(),
            customer_email: email.trim(),
            title: title.trim(),
            description: description.trim(),
            dimensions,
            materials: materials.trim(),
            finish: finish.trim(),
            quantity: Number(quantity),
            notes: notes.trim(),
            reference_image_url: imageUrl.trim(),
          }),
        },
      );

      setResult(response);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <section className="container page-shell">
        <div className="order-confirmation">
          <p className="eyebrow">Request received</p>
          <h2>Let's make something personal.</h2>
          <p>
            Your custom design request has been submitted. Keep this reference
            for any follow-up with the store.
          </p>
          <div className="tracking-credentials">
            <strong>Reference number</strong>
            <code>{result.reference}</code>
            <p className="form-hint">Status: {result.status}</p>
          </div>
          <Link href="/" className="button">Back to home</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="container page-shell">
      <div className="breadcrumbs"><Link href="/">Home</Link> / Custom furniture</div>
      <div className="page-intro">
        <p className="eyebrow">Designed around you</p>
        <h1 className="page-title">Tell us what you're imagining.</h1>
        <p>
          Share your idea, preferred materials, finish and measurements.
          Our team will review your request and contact you about the next step.
        </p>
      </div>

      <div className="checkout-layout">
        <form className="form-stack" onSubmit={submit}>
          <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Your details</h2>
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="design-name">Full name *</label>
              <input className="field" id="design-name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="design-phone">Phone *</label>
              <input className="field" id="design-phone" type="tel" required maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+254 7xx xxx xxx" />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="design-email">Email (optional)</label>
            <input className="field" id="design-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>

          <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, marginTop: 12 }}>Your design</h2>
          <div>
            <label className="field-label" htmlFor="design-title">What would you like made? *</label>
            <input className="field" id="design-title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Six-seater dining table" />
          </div>
          <div>
            <label className="field-label" htmlFor="design-description">Describe your idea *</label>
            <textarea className="textarea-field" id="design-description" required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Shape, intended use, style, seating, special features…" />
          </div>

          <div>
            <label className="field-label">Dimensions (optional)</label>
            <div className="form-grid">
              <input className="field" aria-label="Width" placeholder="Width (e.g. 180 cm)" value={width} onChange={(event) => setWidth(event.target.value)} />
              <input className="field" aria-label="Depth" placeholder="Depth (e.g. 90 cm)" value={depth} onChange={(event) => setDepth(event.target.value)} />
              <input className="field" aria-label="Height" placeholder="Height (e.g. 75 cm)" value={height} onChange={(event) => setHeight(event.target.value)} />
              <input className="field" aria-label="Quantity" type="number" min="1" max="100" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="design-materials">Preferred materials</label>
              <input className="field" id="design-materials" value={materials} onChange={(event) => setMaterials(event.target.value)} placeholder="e.g. Oak, mahogany, steel" />
            </div>
            <div>
              <label className="field-label" htmlFor="design-finish">Finish or colour</label>
              <input className="field" id="design-finish" value={finish} onChange={(event) => setFinish(event.target.value)} placeholder="e.g. Natural wood, matte black" />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="design-image">Reference image URL (optional)</label>
            <input className="field" id="design-image" type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" />
            <p className="form-hint">
              This field accepts an image URL. Direct image upload can be added
              once the backend storage endpoint is implemented.
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="design-notes">Additional notes</label>
            <textarea className="textarea-field" id="design-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Budget expectations, intended space, delivery area…" />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button className="button" type="submit" disabled={loading}>
            {loading ? "Submitting request…" : "Submit design request"}
          </button>
        </form>

        <aside className="summary-card">
          <p className="eyebrow">How it works</p>
          <h2>From idea to piece.</h2>
          <div className="summary-line"><span>01</span><span>Tell us about your design.</span></div>
          <div className="summary-line"><span>02</span><span>Our team reviews your requirements.</span></div>
          <div className="summary-line"><span>03</span><span>We prepare a quote and estimated production time.</span></div>
          <div className="summary-line"><span>04</span><span>Production proceeds after approval.</span></div>
          <p className="form-hint">
            A request is not a confirmed order. The team will review the
            details and contact you with the next steps.
          </p>
        </aside>
      </div>
    </section>
  );
}
