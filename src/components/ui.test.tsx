import { render, screen, fireEvent, act } from "@testing-library/react";
import { AddressChip } from "./ui";

describe("AddressChip", () => {
  const mockAddress = "0x1234567890abcdef1234567890abcdef12345678";

  it("shows copy feedback and clears it after 2000ms", async () => {
    jest.useFakeTimers();
    render(<AddressChip address={mockAddress} />);
    
    const chip = screen.getByText(/0x123456...5678/);
    fireEvent.click(chip);

    // Verifica se o ícone de check aparece
    expect(screen.getByTestId("check-icon")).toBeInTheDocument();

    // Avança o tempo
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Verifica se o ícone de copy volta
    expect(screen.getByTestId("copy-icon")).toBeInTheDocument();
    jest.useRealTimers();
  });

  it("handles rapid consecutive clicks correctly", async () => {
    jest.useFakeTimers();
    render(<AddressChip address={mockAddress} />);
    
    const chip = screen.getByText(/0x123456...5678/);
    
    // Primeiro clique
    fireEvent.click(chip);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Segundo clique antes do primeiro timer acabar
    fireEvent.click(chip);
    
    // Avança o tempo do primeiro timer (que deveria ter sido cancelado)
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    // O feedback ainda deve estar ativo devido ao segundo clique
    expect(screen.getByTestId("check-icon")).toBeInTheDocument();

    // Avança o tempo do segundo timer
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByTestId("copy-icon")).toBeInTheDocument();
    jest.useRealTimers();
  });

  it("does not update state after unmount", () => {
    jest.useFakeTimers();
    const { unmount } = render(<AddressChip address={mockAddress} />);
    
    const chip = screen.getByText(/0x123456...5678/);
    fireEvent.click(chip);
    
    unmount();

    // Avança o tempo para disparar o timeout que foi limpo no unmount
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Se não houver erro de "state update on unmounted component", o teste passa
    jest.useRealTimers();
  });
});
