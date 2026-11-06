import Copy from "@/components/Copy";
import { FIELD } from "@/components/field/config";
import Field from "@/components/field/Field";
import Mobile from "@/components/mobile/Mobile";

export default function Home() {
  // FIELD.solo: the background alone, for tuning it.
  if (FIELD.enabled && FIELD.solo) return <Field />;
  return (
    <>
      <Field />
      <Mobile />
      <Copy />
    </>
  );
}
