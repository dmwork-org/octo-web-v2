import { describe, expect, it } from "vitest";
import { buildPersonaBotCandidates } from "./bot-candidates";

describe("buildPersonaBotCandidates", () => {
  it("filters my_bots and space_bots to bots created by the current user", () => {
    const bots = buildPersonaBotCandidates({
      open: true,
      myUid: "alice",
      myBots: [
        { uid: "mine_friend", name: "Mine", creator_uid: "alice" },
        { uid: "bob_bot", name: "Bob", creator_uid: "bob" },
        { uid: "legacy_no_creator", name: "Legacy" },
      ],
      spaceBots: [
        { uid: "mine_space", name: "Mine Space", creator_uid: "alice" },
        { uid: "carol_bot", name: "Carol", creator_uid: "carol" },
      ],
      grants: [],
    });

    expect(bots.map((b) => b.uid)).toEqual(["mine_friend", "mine_space"]);
  });

  it("dedupes candidates and removes already granted bots", () => {
    const bots = buildPersonaBotCandidates({
      open: true,
      myUid: "alice",
      myBots: [{ uid: "shared", name: "From my", creator_uid: "alice" }],
      spaceBots: [
        { uid: "shared", name: "From space", creator_uid: "alice" },
        { uid: "new_one", name: "New", creator_uid: "alice" },
      ],
      grants: [
        {
          id: 1,
          grantor_uid: "alice",
          grantee_bot_uid: "shared",
          mode: "auto",
          global_enabled: true,
          active: true,
        },
      ],
    });

    expect(bots.map((b) => b.uid)).toEqual(["new_one"]);
  });
});
