/**
 * IM 消息 contentType 常量(对应旧项目 packages/dmworkbase/src/Service/Const.ts::MessageContentTypeConst)。
 * SDK 内置 MessageContentType 只覆盖 text/image/signalMessage,其他类型新项目这里集中。
 */
export const MessageContentTypeConst = {
  historySplit: -3,
  typing: -2,
  time: -1,
  text: 1,
  image: 2,
  gif: 3,
  voice: 4,
  smallVideo: 5,
  location: 6,
  card: 7,
  file: 8,
  mergeForward: 11,
  lottieSticker: 12,
  lottieEmojiSticker: 13,
  richText: 14,
  summaryCard: 15,
  joinOrganization: 16,
  screenshot: 20,
  // System types(1000-2000)
  addMembers: 1002,
  removeMembers: 1003,
  channelUpdate: 1005,
  newGroupOwner: 1008,
  approveGroupMember: 1009,
  threadCreated: 1100,
  // RTC 9900-9999
  rtcResult: 9989,
  rtcSwitchToVideo: 9990,
  rtcSwitchToVideoReply: 9991,
  rtcCancel: 9992,
  rtcSwitchToAudio: 9993,
  rtcData: 9994,
  rtcMissed: 9995,
  rtcReceived: 9996,
  rtcRefuse: 9997,
  rtcAccept: 9998,
  rtcHangup: 9999,
} as const;

export type MessageContentTypeKey = keyof typeof MessageContentTypeConst;
