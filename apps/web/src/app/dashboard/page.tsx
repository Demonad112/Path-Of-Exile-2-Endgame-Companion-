import type { Metadata } from "next";
import { farmingStrategies } from "@/data/strategies";
import { pinnacleBosses } from "@/data/bosses";
import { metaBuilds } from "@/data/metaBuilds";
import { currencyMilestones } from "@/data/currencyMilestones";
import { commonMistakes } from "@/data/commonMistakes";
import { StrategyTable } from "@/components/dashboard/StrategyTable";
import { StrategyQuiz } from "@/components/dashboard/StrategyQuiz";
import { BossCard } from "@/components/dashboard/BossCard";
import { MetaBuildList } from "@/components/dashboard/MetaBuildList";
import { CurrencyMilestones } from "@/components/dashboard/CurrencyMilestones";
import { WarningPanel } from "@/components/shared/WarningPanel";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: "Farming Dashboard — PoE2 Endgame Companion",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Farming Dashboard"
        description="Ranked strategies, a quick picker, pinnacle boss requirements, and current meta builds — numbers are community-derived and will drift across patches."
      />

      <section>
        <SectionTitle>Which strategy should I run?</SectionTitle>
        <StrategyQuiz />
      </section>

      <WarningPanel mistakes={commonMistakes} stage="dashboard" />

      <section>
        <SectionTitle>Ranked farming strategies</SectionTitle>
        <StrategyTable strategies={farmingStrategies} />
      </section>

      <section>
        <SectionTitle>Pinnacle bosses</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pinnacleBosses.map((boss) => (
            <BossCard key={boss.id} boss={boss} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Current meta builds</SectionTitle>
        <MetaBuildList builds={metaBuilds} />
      </section>

      <section>
        <SectionTitle>Currency milestones</SectionTitle>
        <CurrencyMilestones milestones={currencyMilestones} />
      </section>
    </div>
  );
}
