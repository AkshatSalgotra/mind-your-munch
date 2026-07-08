import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

type FoodSeed = {
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category: string;
  source: string | null;
  verified: boolean;
};

type SwapSeed = {
  cravingQuery: string;
  targetFoodName: string;
  reason: string;
};

function loadJson<T>(file: string): T {
  const path = join(__dirname, "data", file);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

async function main() {
  const foods = loadJson<FoodSeed[]>("foods.json");
  const swaps = loadJson<SwapSeed[]>("swaps.json");

  // Idempotent: wipe in FK-safe order (Swap depends on Food) then reseed.
  await prisma.swap.deleteMany();
  await prisma.food.deleteMany();

  await prisma.food.createMany({ data: foods });

  // Resolve each swap's target food by name -> id.
  const created = await prisma.food.findMany({ select: { id: true, name: true } });
  const idByName = new Map(created.map((f) => [f.name, f.id]));

  for (const swap of swaps) {
    const targetFoodId = idByName.get(swap.targetFoodName);
    if (!targetFoodId) {
      throw new Error(
        `Swap "${swap.cravingQuery}" references unknown food "${swap.targetFoodName}". ` +
          `Add it to foods.json or fix the name.`
      );
    }
    await prisma.swap.create({
      data: {
        cravingQuery: swap.cravingQuery,
        targetFoodId,
        reason: swap.reason,
      },
    });
  }

  console.log(`Seeded ${foods.length} foods, ${swaps.length} swaps`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
