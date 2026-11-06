import { validateScenario } from "@meridian/core";
import { september1939 } from "@meridian/content";

const errors = validateScenario(september1939);
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `${september1939.name}: ${september1939.countries.length} countries, ${september1939.provinces.length} provinces, ${september1939.divisions.length} divisions.`,
);
