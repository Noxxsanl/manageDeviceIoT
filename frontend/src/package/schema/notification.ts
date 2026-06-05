export type NotificationType = "offline" | "attack" | "registration";

export type Notification = {
  id: string;
  title: string;
  description: string;
  time: string;
  type: NotificationType;
  isNew: boolean;
};
