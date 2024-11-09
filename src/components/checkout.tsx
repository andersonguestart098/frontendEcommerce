import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import {
  Box,
  Typography,
  Button,
  TextField,
  useMediaQuery,
  useTheme,
  Divider,
} from "@mui/material";

const Checkout: React.FC = () => {
  const publicKey = process.env.REACT_APP_MERCADO_PAGO_PUBLIC_KEY;
  const navigate = useNavigate();
  const [isMpReady, setIsMpReady] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [mpInstance, setMpInstance] = useState<any>(null);
  const [cardFormInstance, setCardFormInstance] = useState<any>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    string | null
  >(null);

  const [checkoutData, setCheckoutData] = useState<any>({});
  const formRef = useRef<HTMLFormElement | null>(null);
  const { clearCart } = useCart();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [boletoUrl, setBoletoUrl] = useState<string | null>(null);

  const [cardPreview, setCardPreview] = useState({
    cardNumber: "•••• •••• •••• ••••",
    cardHolder: "NOME DO TITULAR",
    expiration: "MM/YY",
  });

  const updateCardPreview = (field: string, value: string) => {
    setCardPreview((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    const storedUserId = localStorage.getItem("userId");
    if (!storedUserId) {
      alert("Erro: Usuário não autenticado. Faça login para continuar.");
      navigate("/login");
      return;
    }

    const storedCheckoutData = localStorage.getItem("checkoutData");
    if (storedCheckoutData) {
      console.log("Checkout data retrieved:", storedCheckoutData);
      setCheckoutData(JSON.parse(storedCheckoutData));
    } else {
      fetchUserDataFromAPI(storedUserId);
    }
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (cardFormInstance) {
        console.log("Desmontando CardForm...");
        cardFormInstance.unmount();
        setCardFormInstance(null);
      }
    };
  }, []);

  const fetchUserDataFromAPI = async (userId: string) => {
    try {
      const response = await axios.get(
        `https://ecommerce-fagundes-13c7f6f3f0d3.herokuapp.com/users/${userId}`
      );
      const userData = {
        firstName: response.data.name,
        lastName: response.data.last_name,
        email: response.data.email,
        identificationType: response.data.identification?.type || "CPF",
        identificationNumber:
          response.data.identification?.number || "00000000000",
        amount: response.data.totalPrice || 100.5,
        shippingCost: response.data.shippingCost || 0,
        userId: userId,
      };
      console.log("User data fetched:", userData);
      setCheckoutData(userData);
      localStorage.setItem("checkoutData", JSON.stringify(userData));
    } catch (error) {
      alert("Não foi possível carregar os dados do usuário.");
    }
  };

 // Carrega o SDK do MercadoPago assim que o componente é montado
useEffect(() => {
  const loadMercadoPagoSdk = async () => {
    if (!publicKey) {
      console.error("Public key não está definida.");
      return;
    }

    if (window.MercadoPago) {
      console.log("MercadoPago SDK já carregado.");
      setSdkLoaded(true);
      setMpInstance(new window.MercadoPago(publicKey, { locale: "pt-BR" }));
    } else {
      const scriptSdk = document.createElement("script");
      scriptSdk.src = "https://sdk.mercadopago.com/js/v2";
      scriptSdk.async = true;
      scriptSdk.onload = () => {
        console.log("MercadoPago SDK carregado com sucesso.");
        setSdkLoaded(true);
        setMpInstance(new window.MercadoPago(publicKey, { locale: "pt-BR" }));
      };
      scriptSdk.onerror = () => {
        console.error("Erro ao carregar o SDK do MercadoPago.");
      };
      document.body.appendChild(scriptSdk);
    }
  };

  loadMercadoPagoSdk();
}, [publicKey]);

// Inicializa o CardForm após carregar SDK e selecionar método "card"
useEffect(() => {
  if (sdkLoaded && mpInstance) {
    if (selectedPaymentMethod === "card") {
      console.log("Chamando initializeCardForm...");
      initializeCardForm();
    } else if (cardFormInstance) {
      console.log("Desmontando CardForm pois o método de pagamento mudou.");
      cardFormInstance.unmount();
      setCardFormInstance(null);
    }
  }
}, [sdkLoaded, mpInstance, selectedPaymentMethod]);

// Cleanup no unmount para garantir que o CardForm não fique ativo
useEffect(() => {
  return () => {
    if (cardFormInstance) {
      console.log("Desmontando CardForm ao desmontar o componente...");
      cardFormInstance.unmount();
      setCardFormInstance(null);
    }
  };
}, []);


  useEffect(() => {
    if (sdkLoaded && mpInstance && selectedPaymentMethod === "card") {
      console.log("Chamando initializeCardForm...");
      initializeCardForm();
    }
  }, [sdkLoaded, mpInstance, selectedPaymentMethod]);

  const handleCardSubmit = async () => {
    console.log("Iniciando submissão do formulário...");
  
    if (!cardFormInstance) {
      console.error("Erro: CardForm não está inicializado.");
      alert("Erro interno: O formulário não está pronto. Tente novamente.");
      return;
    }
  
    try {
      const formData = cardFormInstance.getCardFormData();
  
      console.log("Form Data Recebido do MercadoPago:", formData);
  
      // Validar se o token foi gerado corretamente antes de continuar
      if (!formData.token || formData.token.trim() === "") {
        alert("Erro ao gerar token do cartão. Tente novamente.");
        return;
      }
  
      const missingFields: string[] = [];
      if (!formData.cardNumber) missingFields.push("Número do cartão");
      if (!formData.expirationDate) missingFields.push("Data de expiração");
      if (!formData.securityCode) missingFields.push("Código de segurança");
      if (!formData.cardholderName) missingFields.push("Nome do titular");
      if (!formData.cardholderEmail) missingFields.push("E-mail do titular");
      if (!formData.identificationNumber)
        missingFields.push("Número do documento");
  
      if (missingFields.length > 0) {
        alert(
          `Erro: Os seguintes campos estão faltando: ${missingFields.join(", ")}.`
        );
        return;
      }
  
      // Preparar os dados de pagamento
      const paymentData = {
        transaction_amount: calculateTransactionAmount(),
        token: formData.token,
        payment_method_id: formData.paymentMethodId,
        installments: Number(formData.installments || 1),
        issuer_id: formData.issuerId,
        description: "Compra via Cartão de Crédito",
        payer: {
          email: formData.cardholderEmail,
          first_name: formData.cardholderName.split(" ")[0] || "Nome",
          last_name: formData.cardholderName.split(" ").slice(1).join(" ") || "Sobrenome",
          identification: {
            type: formData.identificationType || "CPF",
            number: formData.identificationNumber,
          },
        },
        userId: checkoutData.userId,
      };
  
      console.log("Dados de pagamento prontos:", paymentData);
  
      // Envio para o backend
      const response = await fetch(
        "https://ecommerce-fagundes-13c7f6f3f0d3.herokuapp.com/payment/process_payment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(paymentData),
        }
      );
  
      if (response.ok) {
        console.log("Pagamento processado com sucesso.");
        clearCart();
        navigate("/sucesso");
      } else {
        const errorResponse = await response.json();
        alert(`Erro no pagamento: ${errorResponse.message || "Erro desconhecido."}`);
      }
    } catch (error) {
      console.error("Erro ao processar o pagamento:", error);
      alert("Erro ao processar o pagamento. Tente novamente.");
    }
  };
  

  const initializeCardForm = () => {
    if (cardFormInstance) {
      console.log("CardForm já instanciado.");
      return;
    }
  
    if (!mpInstance) {
      console.error("Erro: Instância do MercadoPago não disponível.");
      return;
    }
  
    if (!formRef.current) {
      console.error("Erro: Referência ao formulário não definida.");
      return;
    }
  
    console.log("Inicializando CardForm...");
  
    try {
      const sanitizedAmount = String(
        parseFloat((checkoutData.totalPrice || "0").replace(",", ".")) || 0
      );
  
      console.log("Valor total sanitizado para o formulário:", sanitizedAmount);
  
      const cardForm = mpInstance.cardForm({
        amount: sanitizedAmount,
        form: {
          id: "form-checkout",
          cardNumber: { id: "form-checkout__cardNumber" },
          expirationDate: { id: "form-checkout__expirationDate" },
          securityCode: { id: "form-checkout__securityCode" },
          cardholderName: { id: "form-checkout__cardholderName" },
          cardholderEmail: { id: "form-checkout__cardholderEmail" },
          issuer: { id: "form-checkout__issuer" },
          installments: { id: "form-checkout__installments" },
          identificationType: { id: "form-checkout__identificationType" },
          identificationNumber: { id: "form-checkout__identificationNumber" },
        },
        callbacks: {
          onFormMounted: (error: any) => {
            if (error) {
              console.error("Erro ao montar o formulário:", error);
              return;
            }
            console.log("Formulário montado com sucesso.");
            setIsMpReady(true);
          },
          onSubmit: async (event: any) => {
            event.preventDefault();
            await handleCardSubmit();
          },
          onCardTokenReceived: (token: any) => {
            if (!token) {
              console.error("Erro ao receber o token do cartão.");
            } else {
              console.log("Token do cartão recebido com sucesso:", token);
            }
          },
        },
      });
  
      console.log("CardForm inicializado:", cardForm);
      setCardFormInstance(cardForm);
    } catch (error) {
      console.error("Erro durante a inicialização do CardForm:", error);
    }
  };
  
  

  function isValidCPF(cpf: string): boolean {
    cpf = cpf.replace(/[^\d]+/g, ""); // Remove caracteres não numéricos
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) {
      soma += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.charAt(9))) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) {
      soma += parseInt(cpf.charAt(i)) * (11 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;

    return resto === parseInt(cpf.charAt(10));
  }

  
  useEffect(() => {
    if (!isMpReady) {
      console.log("Aguardando a inicialização do MercadoPago...");
    } else {
      console.log("MercadoPago pronto para uso.");
    }
  }, [isMpReady]);
  
  const calculateTransactionAmount = (): number | null => {
    try {
      const amount = parseFloat((checkoutData.amount || "0").replace(",", "."));
      const shippingCost = parseFloat(
        (checkoutData.shippingCost || "0").replace(",", ".")
      );
  
      const transactionAmount = amount + shippingCost;
  
      if (isNaN(transactionAmount) || transactionAmount <= 0) {
        throw new Error("Valor da transação inválido");
      }
  
      // Arredondar para 2 casas decimais antes de enviar
      const roundedAmount = parseFloat(transactionAmount.toFixed(2));
      console.log("Valor da transação calculado:", roundedAmount);
      return roundedAmount;
    } catch (error) {
      console.error("Erro ao calcular o valor da transação:", error);
      return null;
    }
  };
  
  const generateBoleto = async () => {
    console.log("Dados antes de gerar o boleto:", {
      amount: checkoutData.amount,
      shippingCost: checkoutData.shippingCost,
      userId: checkoutData.userId,
    });

    const transactionAmount = calculateTransactionAmount(); // Chama a função para calcular

    if (transactionAmount === null) {
      return; // Se houve erro no cálculo, sai da função
    }

    try {
      const response = await fetch(
        "https://ecommerce-fagundes-13c7f6f3f0d3.herokuapp.com/payment/process_payment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_method_id: "bolbradesco",
            transaction_amount: transactionAmount,
            description: "Pagamento via Boleto Bancário",
            payer: {
              email: checkoutData.email,
              first_name: checkoutData.firstName,
              last_name: checkoutData.lastName,
              identification: {
                type: checkoutData.identificationType,
                number: checkoutData.identificationNumber,
              },
            },
            userId: checkoutData.userId,
          }),
        }
      );

      const result = await response.json();
      console.log("Boleto payment response:", result);

      if (response.ok && result.boleto_url) {
        setBoletoUrl(result.boleto_url);
        clearCart();
        navigate("/sucesso", {
          state: { paymentMethod: "boleto", boletoUrl: result.boleto_url },
        });
      } else {
        alert(
          "Erro ao gerar boleto: " + (result.message || "Erro desconhecido")
        );
      }
    } catch (error) {
      console.error("Erro ao processar pagamento com boleto:", error);
      alert("Erro ao processar pagamento com boleto.");
    }
  };

  const handleContinue = async () => {
    if (selectedPaymentMethod === "pix") {
      await generatePixQrCode();
    } else if (selectedPaymentMethod === "boleto") {
      await generateBoleto();
    }
  };

  const generatePixQrCode = async () => {
    console.log("Dados antes de gerar o QR Code Pix:", {
      amount: checkoutData.amount,
      shippingCost: checkoutData.shippingCost,
      userId: checkoutData.userId,
      payer: {
        email: checkoutData.email,
        first_name: checkoutData.firstName,
        last_name: checkoutData.lastName,
        identification: {
          type: checkoutData.identificationType,
          number: checkoutData.identificationNumber,
        },
      },
    });

    const generateBoleto = async () => {
      console.log("Dados antes de gerar o boleto:", {
        amount: checkoutData.amount,
        shippingCost: checkoutData.shippingCost,
        userId: checkoutData.userId,
        payer: {
          email: checkoutData.email,
          first_name: checkoutData.firstName,
          last_name: checkoutData.lastName,
          identification: {
            type: checkoutData.identificationType,
            number: checkoutData.identificationNumber,
          },
        },
      });

      const transactionAmount = calculateTransactionAmount(); // Certifique-se de que essa função está retornando o valor correto

      if (transactionAmount === null) {
        alert("Erro: valor de transação inválido.");
        return;
      }

      try {
        const response = await fetch(
          "https://ecommerce-fagundes-13c7f6f3f0d3.herokuapp.com/payment/process_payment",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payment_method_id: "bolbradesco", // Altere conforme o método correto do MercadoPago
              transaction_amount: transactionAmount,
              description: "Pagamento via Boleto Bancário",
              payer: {
                email: checkoutData.email,
                first_name: checkoutData.firstName,
                last_name: checkoutData.lastName,
                identification: {
                  type: checkoutData.identificationType,
                  number: checkoutData.identificationNumber,
                },
              },
              userId: checkoutData.userId,
            }),
          }
        );

        const result = await response.json();
        console.log("Boleto payment response:", result);

        if (response.ok && result.boleto_url) {
          setBoletoUrl(result.boleto_url); // Atualiza o estado com a URL do boleto
          clearCart(); // Limpa o carrinho após a geração do boleto
          navigate("/sucesso", {
            state: {
              paymentMethod: "boleto",
              boletoUrl: result.boleto_url, // Envia a URL do boleto para a página de sucesso
            },
          });
        } else {
          console.error("Erro ao gerar o boleto:", result);
          alert(result.message || "Erro desconhecido ao gerar o boleto.");
        }
      } catch (error) {
        console.error("Erro ao processar pagamento com boleto:", error);
        alert("Erro ao processar pagamento com boleto. Tente novamente.");
      }
    };

    const transactionAmount = calculateTransactionAmount(); // Certifique-se de que essa função está retornando o valor correto

    if (transactionAmount === null) {
      alert("Erro: valor de transação inválido.");
      return;
    }

    try {
      const response = await fetch(
        "https://ecommerce-fagundes-13c7f6f3f0d3.herokuapp.com/payment/process_payment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_method_id: "pix",
            transaction_amount: transactionAmount,
            description: "Pagamento via Pix",
            payer: {
              email: checkoutData.email,
              first_name: checkoutData.firstName,
              last_name: checkoutData.lastName,
              identification: {
                type: checkoutData.identificationType,
                number: checkoutData.identificationNumber,
              },
            },
            userId: checkoutData.userId,
          }),
        }
      );

      const result = await response.json();
      console.log("Pix payment response:", result);

      if (response.ok && result.qr_code_base64) {
        const qrCode = `data:image/png;base64,${result.qr_code_base64}`;
        setPixQrCode(qrCode);
        clearCart(); // Limpa o carrinho após a geração do QR Code
        navigate("/sucesso", {
          state: {
            paymentMethod: "pix",
            pixQrCode: qrCode,
          },
        });
      } else {
        console.error("Erro ao gerar QR Code Pix:", result);
        alert(result.message || "Erro desconhecido ao gerar QR Code.");
      }
    } catch (error) {
      console.error("Erro ao processar pagamento com Pix:", error);
      alert("Erro ao processar pagamento com Pix. Tente novamente.");
    }
  };

  const paymentButtonStyle = (isSelected: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "15px",
    marginBottom: "10px",
    border: isSelected ? "2px solid #313926" : "1px solid #E6E3DB",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: isSelected ? "#E6E3DB" : "#FFF",
  });

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "20px",
        gap: "20px",
      }}
    >
      <Box
        sx={{
          flex: 1,
          padding: "20px",
          border: "1px solid #E6E3DB",
          borderRadius: "8px",
          backgroundColor: "#F9F9F7",
        }}
      >
        <Typography
          variant="h5"
          gutterBottom
          sx={{ fontWeight: "bold", color: "#313926" }}
        >
          Forma de Pagamento
        </Typography>

        {selectedPaymentMethod === "card" && (
          <Box
            sx={{
              backgroundColor: "#313926",
              color: "#FFF",
              borderRadius: "10px",
              padding: "15px",
              textAlign: "center",
              marginBottom: "20px",
            }}
          >
            <Typography variant="body2">{cardPreview.cardNumber}</Typography>
            <Typography variant="body2">{cardPreview.cardHolder}</Typography>
            <Typography variant="body2">{cardPreview.expiration}</Typography>
          </Box>
        )}

        <Box
          onClick={() => setSelectedPaymentMethod("pix")}
          sx={paymentButtonStyle(selectedPaymentMethod === "pix")}
        >
          <span>Pix</span>
        </Box>
        <Box
          onClick={() => setSelectedPaymentMethod("boleto")}
          sx={paymentButtonStyle(selectedPaymentMethod === "boleto")}
        >
          <span>Boleto Bancário</span>
        </Box>
        <Box
          onClick={() => setSelectedPaymentMethod("card")}
          sx={paymentButtonStyle(selectedPaymentMethod === "card")}
        >
          <span>Cartão de Crédito</span>
        </Box>

        {selectedPaymentMethod === "card" && (
          <form id="form-checkout" ref={formRef} onSubmit={handleCardSubmit}>
            <input
              type="text"
              id="form-checkout__cardNumber"
              placeholder="Número do cartão"
              disabled={!isMpReady}
            />
            <input
              type="text"
              id="form-checkout__expirationDate"
              placeholder="MM/YY"
              disabled={!isMpReady}
            />
            <input
              type="text"
              id="form-checkout__securityCode"
              placeholder="CVC"
              disabled={!isMpReady}
            />
            <input
              type="text"
              id="form-checkout__cardholderName"
              placeholder="Nome do titular"
              disabled={!isMpReady}
            />
            <input
              type="email"
              id="form-checkout__cardholderEmail"
              placeholder="E-mail"
              disabled={!isMpReady}
            />
            <select id="form-checkout__issuer" disabled={!isMpReady}>
              <option value="">Selecione o banco emissor</option>
            </select>
            <select id="form-checkout__installments" disabled={!isMpReady}>
              <option value="">Número de parcelas</option>
            </select>
            <select
              id="form-checkout__identificationType"
              disabled={!isMpReady}
            >
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
            </select>
            <input
              type="text"
              id="form-checkout__identificationNumber"
              placeholder="Número do documento"
              disabled={!isMpReady}
            />
            <Button type="submit" fullWidth disabled={!isMpReady}>
              {isMpReady ? "Pagar" : "Carregando..."}
            </Button>
          </form>
        )}

        {selectedPaymentMethod !== "card" && (
          <Button
            onClick={handleContinue}
            sx={{
              backgroundColor: "#313926",
              color: "#FFF",
              width: "100%",
              mt: 2,
              "&:hover": { backgroundColor: "#2a2e24" },
            }}
          >
            Continuar
          </Button>
        )}
      </Box>

      <Box
        sx={{
          width: isMobile ? "100%" : "300px",
          padding: "20px",
          border: "1px solid #E6E3DB",
          borderRadius: "8px",
          backgroundColor: "#F9F9F7",
          textAlign: "center",
        }}
      >
        <Typography
          variant="h5"
          sx={{ fontWeight: "bold", color: "#313926", mb: 2 }}
        >
          Resumo
        </Typography>

        {/* Alinhamento à esquerda e linha sutil */}
        <Box sx={{ textAlign: "left", mb: 1 }}>
          <Typography>
            Valor dos Produtos: R$ {checkoutData.amount || "0,00"}
          </Typography>
          <Divider sx={{ borderColor: "#E6E3DB", my: 1 }} />
          <Typography>
            Descontos: R$ {checkoutData.discount || "0,00"}
          </Typography>
          <Divider sx={{ borderColor: "#E6E3DB", my: 1 }} />
          <Typography>
            Frete: R$ {checkoutData.shippingCost || "0,00"}
          </Typography>
        </Box>

        {/* Cálculo do total com conversão de string para número */}
        <Typography sx={{ fontWeight: "bold", mt: 1 }}>
          Total: R${" "}
          {(
            (parseFloat((checkoutData.amount || "0,00").replace(",", ".")) ||
              0) -
            (parseFloat((checkoutData.discount || "0,00").replace(",", ".")) ||
              0) +
            (parseFloat(
              (checkoutData.shippingCost || "0,00").replace(",", ".")
            ) || 0)
          )
            .toFixed(2)
            .replace(".", ",")}
        </Typography>
      </Box>
    </Box>
  );
};

export default Checkout;
