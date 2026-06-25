import WKSDK, {
  Channel,
  ChannelInfo,
  ChannelTypeGroup,
  Conversation,
  Message,
  Reminder,
  ReminderType,
} from "wukongimjssdk";
import { afterEach, describe, expect, it } from "vitest";
import { effectiveMute, isMentionMe } from "./conversation-last-content";

const CHANNEL_TYPE_THREAD = 5;
const parentChannel = new Channel("group-1", ChannelTypeGroup);
const threadChannel = new Channel("group-1____thread-1", CHANNEL_TYPE_THREAD);

function setParentMute(mute: boolean): void {
  const info = new ChannelInfo();
  info.channel = parentChannel;
  info.mute = mute;
  WKSDK.shared().channelManager.setChannleInfoForCache(info);
}

function threadConversation(threadMute: number | null): Conversation {
  const conv = new Conversation();
  conv.channel = threadChannel;
  const info = new ChannelInfo();
  info.channel = conv.channel;
  info.mute = threadMute === 1;
  info.orgData = { parentGroupNo: "group-1", thread: { mute: threadMute } };
  WKSDK.shared().channelManager.setChannleInfoForCache(info);
  return conv;
}

function mentionConversation(unread: number): Conversation {
  const conv = new Conversation();
  conv.channel = parentChannel;
  conv.unread = unread;
  const message = new Message();
  message.content = { mention: { uids: ["me"] } };
  conv.lastMessage = message;
  return conv;
}

function mentionReminder(done: boolean): Reminder {
  const reminder = new Reminder();
  reminder.reminderID = 1;
  reminder.reminderType = ReminderType.ReminderTypeMentionMe;
  reminder.done = done;
  return reminder;
}

describe("effectiveMute", () => {
  afterEach(() => {
    WKSDK.shared().channelManager.deleteChannelInfo(parentChannel);
    WKSDK.shared().channelManager.deleteChannelInfo(threadChannel);
  });

  it("inherits parent group mute when a thread has no explicit mute setting", () => {
    setParentMute(true);

    expect(effectiveMute(threadConversation(null))).toBe(true);
  });

  it("lets explicit thread mute override the parent group", () => {
    setParentMute(true);

    expect(effectiveMute(threadConversation(0))).toBe(false);
  });
});

describe("isMentionMe", () => {
  it("keeps undone server reminders authoritative", () => {
    const conv = mentionConversation(0);
    conv.reminders = [mentionReminder(false)];

    expect(isMentionMe(conv, "me")).toBe(true);
  });

  it("uses last-message mention fallback only while unread remains", () => {
    expect(isMentionMe(mentionConversation(1), "me")).toBe(true);
    expect(isMentionMe(mentionConversation(0), "me")).toBe(false);
  });
});
