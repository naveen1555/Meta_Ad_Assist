import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Creates a demo account with sample contacts, leads and a chatbot flow. */
async function main() {
  const email = "demo@chatnova.app";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Demo user already exists: ${email} / demo12345`);
    return;
  }
  const user = await prisma.user.create({
    data: { email, name: "Demo Owner", passwordHash: await bcrypt.hash("demo12345", 10) },
  });
  const ws = await prisma.workspace.create({
    data: { name: "Acme Realty", members: { create: { userId: user.id, role: "OWNER" } } },
  });

  const people: [string, string, string | null, string[]][] = [
    ["Priya Sharma", "919876543210", "priya@example.com", ["lead", "2bhk"]],
    ["Rahul Verma", "919812345678", "rahul@example.com", ["lead", "villa"]],
    ["Ananya Iyer", "919900112233", "ananya@example.com", ["customer"]],
    ["Karthik Nair", "919988776655", null, ["lead"]],
  ];
  for (const [name, phone, mail, tags] of people) {
    const contact = await prisma.contact.create({
      data: { workspaceId: ws.id, name, phone, email: mail, tags, optIn: true, optInAt: new Date(), source: "seed" },
    });
    if (tags.includes("lead")) {
      await prisma.lead.create({
        data: {
          workspaceId: ws.id,
          contactId: contact.id,
          source: "facebook_lead_ad",
          fields: { full_name: name, phone_number: `+${phone}`, budget: "50 L - 1 Cr", city: "Bengaluru" },
        },
      });
    }
  }

  await prisma.flow.create({
    data: {
      workspaceId: ws.id,
      name: "Property enquiry bot",
      triggerType: "keyword",
      keywords: ["hi", "hello", "price"],
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 120 }, data: {} },
        {
          id: "welcome",
          type: "buttons",
          position: { x: 320, y: 60 },
          data: {
            text: "Hi {{name}}! Welcome to Acme Realty. What are you looking for?",
            buttons: [
              { id: "b2bhk", title: "2BHK apartment" },
              { id: "bvilla", title: "Villa" },
              { id: "bagent", title: "Talk to agent" },
            ],
            saveAs: "interest",
          },
        },
        {
          id: "budget",
          type: "question",
          position: { x: 680, y: 0 },
          data: { text: "Great choice! What is your budget?", saveAs: "budget" },
        },
        { id: "tag", type: "tag", position: { x: 1020, y: 0 }, data: { tags: ["qualified"] } },
        { id: "assign", type: "assign", position: { x: 680, y: 260 }, data: { mode: "round_robin" } },
        {
          id: "bye",
          type: "message",
          position: { x: 1020, y: 220 },
          data: { text: "Thanks! One of our property experts will reach out shortly." },
        },
      ],
      edges: [
        { id: "e1", source: "start", target: "welcome" },
        { id: "e2", source: "welcome", sourceHandle: "b2bhk", target: "budget" },
        { id: "e3", source: "welcome", sourceHandle: "bvilla", target: "budget" },
        { id: "e4", source: "welcome", sourceHandle: "bagent", target: "assign" },
        { id: "e5", source: "budget", target: "tag" },
        { id: "e6", source: "tag", target: "assign" },
        { id: "e7", source: "assign", target: "bye" },
      ],
    },
  });

  console.log(`Seeded demo workspace. Log in with ${email} / demo12345`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
