import { useState } from "react";
import { useStore } from "@tanstack/react-store";
import { Check, Languages } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authStore } from "@/features/base/stores/auth";
import { updateUserLanguage } from "@/features/base/api/endpoints/user.api";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useT } from "@/lib/i18n/use-t";

/**
 * 登录页右上角语言切换器(对齐老仓 LoginLanguageSwitcher,
 * 紧贴 `5ef5150f` panel 设计):
 *
 *   - 32×32 透明按钮 + Languages 图标 → 右上角 absolute
 *   - 点击展开下拉,显 中文 / English 两选项,选中项右侧 ✓
 *   - 登录前(无 token)只 setLocale,登录后调 updateUserLanguage 同步后端
 *     (跟 sidebar.LanguageMenu 同语义),静默失败不干扰登录页
 *   - LoginShell 内 absolute 定位:top-6 right-12,Form panel 内右上角
 */
export function LoginLanguageSwitcher() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const isLogined = useStore(authStore, (s) => !!s.token);
  const [open, setOpen] = useState(false);

  const items: Array<{ value: string; key: string }> = [
    { value: "zh-CN", key: "base.navRail.language.name.zh" },
    { value: "en-US", key: "base.navRail.language.name.en" },
  ];

  const handleSelect = (next: string) => {
    setOpen(false);
    if (next === locale) return;
    setLocale(next);
    if (isLogined) {
      updateUserLanguage(next).catch((err: unknown) => {
        console.warn("[i18n] failed to sync user language preference", err);
      });
    }
  };

  const tooltipKey =
    locale === "zh-CN" ? "base.settings.switchToEnglish" : "base.settings.switchToChinese";

  return (
    <div className="absolute top-6 right-12 z-10">
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t(tooltipKey)}
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#8a8fa8] transition-colors hover:bg-[#f5f6fa] hover:text-[#1a1a2e] ${
                  open ? "bg-[#f5f6fa] text-[#1a1a2e]" : ""
                }`}
              >
                <Languages size={18} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t(tooltipKey)}</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" sideOffset={6} className="w-[132px] p-1">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => handleSelect(item.value)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[#1a1a2e] transition-colors hover:bg-[#f5f6fa] ${
                locale === item.value ? "bg-[#f5f6fa]" : ""
              }`}
              role="menuitemradio"
              aria-checked={locale === item.value}
            >
              <span className="truncate">{t(item.key)}</span>
              {locale === item.value ? (
                <Check size={14} className="shrink-0 text-[#1C1C23]" />
              ) : null}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
