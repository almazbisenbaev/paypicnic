import { CreateForm } from "@/components/create-form";
import { Steps } from "@/components/ui";
import { ArrowUpRight } from "lucide-react";

export default function Home() {
  return (
    <main className="home-main">
      <section className="hero">
        <div>
          <div className="eyebrow">
            <span className="tiny-square" /> BUILT FOR INDEPENDENT TEAMS
          </div>
          <h1>
            Good work.
            <br />
            <span>Fair shares.</span>
            <ArrowUpRight
              className="hero-arrow"
              aria-hidden
              strokeWidth={1.2}
            />
          </h1>
        </div>
        <p>
          One project. Two collaborators.
          <br /> A single payment that pays you both.
          <br />
          <strong>Less chasing. More creating.</strong>
        </p>
      </section>
      <CreateForm />
      <Steps />
    </main>
  );
}
