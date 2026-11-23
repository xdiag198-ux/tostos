import { createContext, useContext } from "react";

/** Позволяет открыть страницу любого профиля из любого места (аватар в ленте, поиск, комментарии). */
type Ctx = { openProfile: (id: string) => void };

const ProfileViewerContext = createContext<Ctx>({ openProfile: () => {} });

export const ProfileViewerProvider = ProfileViewerContext.Provider;
export const useProfileViewer = () => useContext(ProfileViewerContext);
