import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ChatPage from "./page";

vi.mock("@/lib/utils", () => ({ cityId: "metro-city-01" }));
vi.mock("@/lib/api", () => ({
  streamChat: async (_path: string, _body: unknown, onToken: (token: string) => void) => {
    await new Promise(resolve => setTimeout(resolve, 1));
    onToken("Hello");
  },
}));

describe("ChatInterface", () => {
  it("adds a message after submit and shows streamed response", async () => {
    render(<ChatPage />);
    fireEvent.change(screen.getByPlaceholderText(/Ask about traffic/i), {
      target: { value: "Show traffic" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(screen.getByText("Show traffic")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Hello/)).toBeInTheDocument());
  });
});
