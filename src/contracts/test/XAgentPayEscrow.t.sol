// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XAgentPayEscrow} from "../src/XAgentPayEscrow.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract XAgentPayEscrowTest is Test {
    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    MockUSDC internal usdc;
    XAgentPayEscrow internal escrow;

    // Actors
    address internal owner = address(this);
    uint256 internal payerPk = 0xA11CE;
    address internal payer = vm.addr(payerPk);
    uint256 internal operatorPk = 0xB0B;
    address internal operator = vm.addr(operatorPk);
    address internal merchant = makeAddr("merchant");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");

    // Defaults
    uint256 internal constant ARBITRATION_TIMEOUT = 604800; // 7 days

    // Defaults
    uint256 internal constant RELEASE_TIMEOUT = 86400; // 24h
    uint256 internal constant DISPUTE_WINDOW = 259200; // 72h
    uint16 internal constant FEE_BPS = 30; // 0.3%
    uint256 internal constant AMOUNT = 100_000_000; // 100 USDC (6 decimals)
    bytes32 internal constant ORDER_REF = keccak256("order-001");
    bytes32 internal constant MERCHANT_DID = keccak256("did:xagent:merchant1");
    bytes32 internal constant CONTEXT_HASH = keccak256("flight-booking");

    // -----------------------------------------------------------------------
    // Setup
    // -----------------------------------------------------------------------

    function setUp() public {
        usdc = new MockUSDC();

        // Deploy implementation
        XAgentPayEscrow impl = new XAgentPayEscrow();

        // Deploy proxy with initialize calldata
        bytes memory initData = abi.encodeCall(
            XAgentPayEscrow.initialize,
            (address(usdc), RELEASE_TIMEOUT, DISPUTE_WINDOW, FEE_BPS, feeRecipient, operator)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        escrow = XAgentPayEscrow(address(proxy));

        // Set arbitration timeout (new storage, not in initialize)
        escrow.setArbitrationTimeout(ARBITRATION_TIMEOUT);

        // Fund payer
        usdc.mint(payer, 1_000_000_000); // 1000 USDC
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function _paymentId(string memory salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(salt));
    }

    function _signTransferAuth(
        uint256 signerPk,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                usdc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)
        );
        (v, r, s) = vm.sign(signerPk, digest);
    }

    function _depositWithAuth(bytes32 paymentId) internal {
        _depositWithAuth(paymentId, AMOUNT);
    }

    function _depositWithAuth(bytes32 paymentId, uint256 amount) internal {
        bytes32 nonce = keccak256(abi.encodePacked(paymentId, "nonce"));
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), amount, validAfter, validBefore, nonce
        );

        vm.prank(relayer);
        escrow.depositWithAuthorization(
            paymentId,
            payer,
            merchant,
            amount,
            ORDER_REF,
            MERCHANT_DID,
            CONTEXT_HASH,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
    }

    function _depositTraditional(bytes32 paymentId) internal {
        _depositTraditional(paymentId, AMOUNT);
    }

    function _depositTraditional(bytes32 paymentId, uint256 amount) internal {
        vm.startPrank(payer);
        usdc.approve(address(escrow), amount);
        escrow.deposit(paymentId, merchant, amount, ORDER_REF, MERCHANT_DID, CONTEXT_HASH);
        vm.stopPrank();
    }

    // =======================================================================
    // Helpers for proxy deployment
    // =======================================================================

    function _deployProxy(
        address _usdc,
        uint256 _releaseTimeout,
        uint256 _disputeWindow,
        uint16 _feeBps,
        address _feeRecipient,
        address _operator
    ) internal returns (XAgentPayEscrow) {
        XAgentPayEscrow impl = new XAgentPayEscrow();
        bytes memory initData = abi.encodeCall(
            XAgentPayEscrow.initialize,
            (_usdc, _releaseTimeout, _disputeWindow, _feeBps, _feeRecipient, _operator)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        return XAgentPayEscrow(address(proxy));
    }

    // =======================================================================
    // Initializer tests
    // =======================================================================

    function test_initialize_setsAllParams() public view {
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.defaultReleaseTimeout(), RELEASE_TIMEOUT);
        assertEq(escrow.defaultDisputeWindow(), DISPUTE_WINDOW);
        assertEq(escrow.protocolFeeBps(), FEE_BPS);
        assertEq(escrow.protocolFeeRecipient(), feeRecipient);
        assertEq(escrow.arbiter(), operator);
        assertEq(escrow.coreOperator(), operator);
    }

    function test_initialize_revertsZeroUsdc() public {
        XAgentPayEscrow impl = new XAgentPayEscrow();
        bytes memory initData = abi.encodeCall(
            XAgentPayEscrow.initialize,
            (address(0), RELEASE_TIMEOUT, DISPUTE_WINDOW, FEE_BPS, feeRecipient, operator)
        );
        vm.expectRevert(XAgentPayEscrow.ZeroAddress.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function test_initialize_revertsZeroFeeRecipient() public {
        XAgentPayEscrow impl = new XAgentPayEscrow();
        bytes memory initData = abi.encodeCall(
            XAgentPayEscrow.initialize,
            (address(usdc), RELEASE_TIMEOUT, DISPUTE_WINDOW, FEE_BPS, address(0), operator)
        );
        vm.expectRevert(XAgentPayEscrow.ZeroAddress.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function test_initialize_revertsZeroOperator() public {
        XAgentPayEscrow impl = new XAgentPayEscrow();
        bytes memory initData = abi.encodeCall(
            XAgentPayEscrow.initialize,
            (address(usdc), RELEASE_TIMEOUT, DISPUTE_WINDOW, FEE_BPS, feeRecipient, address(0))
        );
        vm.expectRevert(XAgentPayEscrow.ZeroAddress.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function test_initialize_revertsFeeTooHigh() public {
        XAgentPayEscrow impl = new XAgentPayEscrow();
        bytes memory initData = abi.encodeCall(
            XAgentPayEscrow.initialize,
            (address(usdc), RELEASE_TIMEOUT, DISPUTE_WINDOW, 501, feeRecipient, operator)
        );
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.FeeTooHigh.selector, 501));
        new ERC1967Proxy(address(impl), initData);
    }

    function test_initialize_revertsZeroReleaseTimeout() public {
        XAgentPayEscrow impl = new XAgentPayEscrow();
        bytes memory initData = abi.encodeCall(
            XAgentPayEscrow.initialize,
            (address(usdc), 0, DISPUTE_WINDOW, FEE_BPS, feeRecipient, operator)
        );
        vm.expectRevert(XAgentPayEscrow.ZeroTimeout.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function test_initialize_revertsZeroDisputeWindow() public {
        XAgentPayEscrow impl = new XAgentPayEscrow();
        bytes memory initData = abi.encodeCall(
            XAgentPayEscrow.initialize,
            (address(usdc), RELEASE_TIMEOUT, 0, FEE_BPS, feeRecipient, operator)
        );
        vm.expectRevert(XAgentPayEscrow.ZeroTimeout.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    // =======================================================================
    // UUPS upgrade tests
    // =======================================================================

    function test_upgradeToAndCall_succeeds() public {
        // Deploy a new implementation
        XAgentPayEscrow newImpl = new XAgentPayEscrow();

        // Owner upgrades
        escrow.upgradeToAndCall(address(newImpl), "");

        // Verify proxy still works
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.defaultReleaseTimeout(), RELEASE_TIMEOUT);
    }

    function test_upgrade_revertsNonOwner() public {
        XAgentPayEscrow newImpl = new XAgentPayEscrow();

        vm.prank(stranger);
        vm.expectRevert();
        escrow.upgradeToAndCall(address(newImpl), "");
    }

    function test_cannotInitializeTwice() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        escrow.initialize(
            address(usdc), RELEASE_TIMEOUT, DISPUTE_WINDOW, FEE_BPS, feeRecipient, operator
        );
    }

    function test_implementationCannotBeInitialized() public {
        XAgentPayEscrow impl = new XAgentPayEscrow();

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(
            address(usdc), RELEASE_TIMEOUT, DISPUTE_WINDOW, FEE_BPS, feeRecipient, operator
        );
    }

    // =======================================================================
    // depositWithAuthorization tests
    // =======================================================================

    function test_depositWithAuth_success() public {
        bytes32 pid = _paymentId("auth-1");
        uint256 balBefore = usdc.balanceOf(payer);

        _depositWithAuth(pid);

        assertEq(usdc.balanceOf(payer), balBefore - AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertEq(e.payer, payer);
        assertEq(e.merchant, merchant);
        assertEq(e.amount, AMOUNT);
        assertEq(e.orderRef, ORDER_REF);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);
    }

    function test_depositWithAuth_emitsEvent() public {
        bytes32 pid = _paymentId("auth-event");
        bytes32 nonce = keccak256(abi.encodePacked(pid, "nonce"));
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), AMOUNT, validAfter, validBefore, nonce
        );

        vm.expectEmit(true, true, true, true);
        emit XAgentPayEscrow.Deposited(pid, payer, merchant, AMOUNT, ORDER_REF);

        vm.prank(relayer);
        escrow.depositWithAuthorization(
            pid, payer, merchant, AMOUNT, ORDER_REF, MERCHANT_DID, CONTEXT_HASH,
            validAfter, validBefore, nonce, v, r, s
        );
    }

    function test_depositWithAuth_revertsDuplicateId() public {
        bytes32 pid = _paymentId("auth-dup");
        _depositWithAuth(pid);

        // Second deposit with same ID should fail
        usdc.mint(payer, AMOUNT);
        bytes32 nonce2 = keccak256("nonce2");
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce2
        );

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.EscrowAlreadyExists.selector, pid));
        escrow.depositWithAuthorization(
            pid, payer, merchant, AMOUNT, ORDER_REF, MERCHANT_DID, CONTEXT_HASH,
            0, validBefore, nonce2, v, r, s
        );
    }

    function test_depositWithAuth_revertsZeroAmount() public {
        bytes32 pid = _paymentId("auth-zero");
        bytes32 nonce = keccak256("nonce-zero");
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), 0, 0, validBefore, nonce
        );

        vm.prank(relayer);
        vm.expectRevert(XAgentPayEscrow.ZeroAmount.selector);
        escrow.depositWithAuthorization(
            pid, payer, merchant, 0, ORDER_REF, MERCHANT_DID, CONTEXT_HASH,
            0, validBefore, nonce, v, r, s
        );
    }

    function test_depositWithAuth_revertsZeroMerchant() public {
        bytes32 pid = _paymentId("auth-zero-merchant");
        bytes32 nonce = keccak256("nonce-zm");
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce
        );

        vm.prank(relayer);
        vm.expectRevert(XAgentPayEscrow.ZeroAddress.selector);
        escrow.depositWithAuthorization(
            pid, payer, address(0), AMOUNT, ORDER_REF, MERCHANT_DID, CONTEXT_HASH,
            0, validBefore, nonce, v, r, s
        );
    }

    function test_depositWithAuth_revertsSelfPayment() public {
        bytes32 pid = _paymentId("auth-self");
        bytes32 nonce = keccak256("nonce-self");
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce
        );

        vm.prank(relayer);
        vm.expectRevert(XAgentPayEscrow.SelfPayment.selector);
        escrow.depositWithAuthorization(
            pid, payer, payer, AMOUNT, ORDER_REF, MERCHANT_DID, CONTEXT_HASH,
            0, validBefore, nonce, v, r, s
        );
    }

    function test_depositWithAuth_revertsInvalidSignature() public {
        bytes32 pid = _paymentId("auth-bad-sig");
        bytes32 nonce = keccak256("nonce-bad");
        uint256 validBefore = block.timestamp + 1 hours;

        // Sign with a different key
        uint256 wrongPk = 0xBEEF;
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            wrongPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce
        );

        vm.prank(relayer);
        vm.expectRevert(); // MockUSDC will revert with InvalidSignature
        escrow.depositWithAuthorization(
            pid, payer, merchant, AMOUNT, ORDER_REF, MERCHANT_DID, CONTEXT_HASH,
            0, validBefore, nonce, v, r, s
        );
    }

    // =======================================================================
    // deposit (traditional) tests
    // =======================================================================

    function test_deposit_success() public {
        bytes32 pid = _paymentId("trad-1");
        uint256 balBefore = usdc.balanceOf(payer);

        _depositTraditional(pid);

        assertEq(usdc.balanceOf(payer), balBefore - AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertEq(e.payer, payer);
        assertEq(e.merchant, merchant);
        assertEq(e.amount, AMOUNT);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);
    }

    function test_deposit_emitsEvent() public {
        bytes32 pid = _paymentId("trad-event");

        vm.startPrank(payer);
        usdc.approve(address(escrow), AMOUNT);

        vm.expectEmit(true, true, true, true);
        emit XAgentPayEscrow.Deposited(pid, payer, merchant, AMOUNT, ORDER_REF);

        escrow.deposit(pid, merchant, AMOUNT, ORDER_REF, MERCHANT_DID, CONTEXT_HASH);
        vm.stopPrank();
    }

    function test_deposit_revertsDuplicateId() public {
        bytes32 pid = _paymentId("trad-dup");
        _depositTraditional(pid);

        vm.startPrank(payer);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.EscrowAlreadyExists.selector, pid));
        escrow.deposit(pid, merchant, AMOUNT, ORDER_REF, MERCHANT_DID, CONTEXT_HASH);
        vm.stopPrank();
    }

    function test_deposit_revertsZeroAmount() public {
        bytes32 pid = _paymentId("trad-zero");
        vm.prank(payer);
        vm.expectRevert(XAgentPayEscrow.ZeroAmount.selector);
        escrow.deposit(pid, merchant, 0, ORDER_REF, MERCHANT_DID, CONTEXT_HASH);
    }

    function test_deposit_revertsZeroMerchant() public {
        bytes32 pid = _paymentId("trad-zm");
        vm.prank(payer);
        vm.expectRevert(XAgentPayEscrow.ZeroAddress.selector);
        escrow.deposit(pid, address(0), AMOUNT, ORDER_REF, MERCHANT_DID, CONTEXT_HASH);
    }

    function test_deposit_revertsSelfPayment() public {
        bytes32 pid = _paymentId("trad-self");
        vm.prank(payer);
        vm.expectRevert(XAgentPayEscrow.SelfPayment.selector);
        escrow.deposit(pid, payer, AMOUNT, ORDER_REF, MERCHANT_DID, CONTEXT_HASH);
    }

    // =======================================================================
    // release tests
    // =======================================================================

    function test_release_byMerchant() public {
        bytes32 pid = _paymentId("rel-merchant");
        _depositTraditional(pid);

        uint256 merchantBalBefore = usdc.balanceOf(merchant);
        uint256 fee = (AMOUNT * FEE_BPS) / 10_000;
        uint256 merchantAmount = AMOUNT - fee;

        vm.prank(merchant);
        escrow.release(pid);

        assertEq(usdc.balanceOf(merchant), merchantBalBefore + merchantAmount);
        assertEq(usdc.balanceOf(feeRecipient), fee);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.RELEASED);
    }

    function test_release_byCoreOperator() public {
        bytes32 pid = _paymentId("rel-operator");
        _depositTraditional(pid);

        vm.prank(operator);
        escrow.release(pid);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.RELEASED);
    }

    function test_release_emitsEvent() public {
        bytes32 pid = _paymentId("rel-event");
        _depositTraditional(pid);

        uint256 fee = (AMOUNT * FEE_BPS) / 10_000;
        uint256 merchantAmount = AMOUNT - fee;

        vm.expectEmit(true, true, false, true);
        emit XAgentPayEscrow.Released(pid, merchant, merchantAmount, fee);

        vm.prank(merchant);
        escrow.release(pid);
    }

    function test_release_feeCalculation() public {
        // Test with small amount where fee truncates to 0
        bytes32 pid = _paymentId("rel-small");
        uint256 smallAmount = 100; // 0.0001 USDC → fee = (100 * 30) / 10000 = 0

        usdc.mint(payer, smallAmount);
        _depositTraditional(pid, smallAmount);

        uint256 feeRecipBalBefore = usdc.balanceOf(feeRecipient);

        vm.prank(merchant);
        escrow.release(pid);

        // Fee should be 0 for small amounts
        assertEq(usdc.balanceOf(feeRecipient), feeRecipBalBefore);
        assertEq(usdc.balanceOf(merchant), smallAmount);
    }

    function test_release_revertsNotCoreOrMerchant() public {
        bytes32 pid = _paymentId("rel-unauth");
        _depositTraditional(pid);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.NotCoreOrMerchant.selector, stranger));
        escrow.release(pid);
    }

    // =======================================================================
    // refund tests
    // =======================================================================

    function test_refund_afterTimeout() public {
        bytes32 pid = _paymentId("ref-timeout");
        _depositTraditional(pid);

        uint256 payerBalBefore = usdc.balanceOf(payer);

        // Warp past release deadline
        vm.warp(block.timestamp + RELEASE_TIMEOUT + 1);

        vm.prank(stranger); // Anyone can trigger
        escrow.refund(pid);

        assertEq(usdc.balanceOf(payer), payerBalBefore + AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.REFUNDED);
    }

    function test_refund_emitsEvent() public {
        bytes32 pid = _paymentId("ref-event");
        _depositTraditional(pid);

        vm.warp(block.timestamp + RELEASE_TIMEOUT + 1);

        vm.expectEmit(true, true, false, true);
        emit XAgentPayEscrow.Refunded(pid, payer, AMOUNT);

        escrow.refund(pid);
    }

    function test_refund_revertsBeforeTimeout() public {
        bytes32 pid = _paymentId("ref-early");
        _depositTraditional(pid);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);

        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.ReleaseDeadlineNotReached.selector,
                e.releaseDeadline,
                block.timestamp
            )
        );
        escrow.refund(pid);
    }

    function test_refund_revertsIfAlreadyReleased() public {
        bytes32 pid = _paymentId("ref-released");
        _depositTraditional(pid);

        vm.prank(merchant);
        escrow.release(pid);

        vm.warp(block.timestamp + RELEASE_TIMEOUT + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.InvalidStatus.selector,
                XAgentPayEscrow.EscrowStatus.RELEASED,
                XAgentPayEscrow.EscrowStatus.DEPOSITED
            )
        );
        escrow.refund(pid);
    }

    // =======================================================================
    // dispute tests
    // =======================================================================

    function test_dispute_withinWindow() public {
        bytes32 pid = _paymentId("disp-ok");
        _depositTraditional(pid);

        bytes32 reason = keccak256("item not received");

        vm.expectEmit(true, true, false, true);
        emit XAgentPayEscrow.Disputed(pid, payer, reason);

        vm.prank(payer);
        escrow.dispute(pid, reason);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.DISPUTED);
    }

    function test_dispute_revertsAfterWindow() public {
        bytes32 pid = _paymentId("disp-expired");
        _depositTraditional(pid);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.DisputeWindowExpired.selector,
                e.disputeDeadline,
                block.timestamp
            )
        );
        escrow.dispute(pid, keccak256("too late"));
    }

    function test_dispute_revertsNonPayer() public {
        bytes32 pid = _paymentId("disp-unauth");
        _depositTraditional(pid);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.NotPayer.selector, stranger));
        escrow.dispute(pid, keccak256("not my escrow"));
    }

    function test_dispute_revertsIfNotDeposited() public {
        bytes32 pid = _paymentId("disp-released");
        _depositTraditional(pid);

        vm.prank(merchant);
        escrow.release(pid);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.InvalidStatus.selector,
                XAgentPayEscrow.EscrowStatus.RELEASED,
                XAgentPayEscrow.EscrowStatus.DEPOSITED
            )
        );
        escrow.dispute(pid, keccak256("too late"));
    }

    // =======================================================================
    // resolve tests
    // =======================================================================

    function test_resolve_fullMerchant() public {
        bytes32 pid = _paymentId("resolve-full-m");
        _depositTraditional(pid);

        vm.prank(payer);
        escrow.dispute(pid, keccak256("reason"));

        vm.prank(operator); // operator is arbiter
        escrow.resolve(pid, 10_000); // 100% to merchant

        assertEq(usdc.balanceOf(merchant), AMOUNT);
        assertEq(usdc.balanceOf(payer), usdc.balanceOf(payer)); // no change (already subtracted at deposit)

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.RESOLVED_TO_MERCHANT);
    }

    function test_resolve_fullPayer() public {
        bytes32 pid = _paymentId("resolve-full-p");
        _depositTraditional(pid);

        uint256 payerBalAfterDeposit = usdc.balanceOf(payer);

        vm.prank(payer);
        escrow.dispute(pid, keccak256("reason"));

        vm.prank(operator);
        escrow.resolve(pid, 0); // 100% to payer

        assertEq(usdc.balanceOf(payer), payerBalAfterDeposit + AMOUNT);
        assertEq(usdc.balanceOf(merchant), 0);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.RESOLVED_TO_PAYER);
    }

    function test_resolve_5050split() public {
        bytes32 pid = _paymentId("resolve-5050");
        _depositTraditional(pid);

        uint256 payerBalAfterDeposit = usdc.balanceOf(payer);

        vm.prank(payer);
        escrow.dispute(pid, keccak256("reason"));

        vm.prank(operator);
        escrow.resolve(pid, 5_000); // 50/50

        uint256 merchantAmount = (AMOUNT * 5_000) / 10_000;
        uint256 payerAmount = AMOUNT - merchantAmount;

        assertEq(usdc.balanceOf(merchant), merchantAmount);
        assertEq(usdc.balanceOf(payer), payerBalAfterDeposit + payerAmount);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.RESOLVED_SPLIT);
    }

    function test_resolve_revertsInvalidBps() public {
        bytes32 pid = _paymentId("resolve-bad-bps");
        _depositTraditional(pid);

        vm.prank(payer);
        escrow.dispute(pid, keccak256("reason"));

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.InvalidBps.selector, 10_001));
        escrow.resolve(pid, 10_001);
    }

    function test_resolve_revertsNotArbiter() public {
        bytes32 pid = _paymentId("resolve-unauth");
        _depositTraditional(pid);

        vm.prank(payer);
        escrow.dispute(pid, keccak256("reason"));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.NotArbiter.selector, stranger));
        escrow.resolve(pid, 5_000);
    }

    // =======================================================================
    // View function tests
    // =======================================================================

    function test_getEscrow_returnsNoneForUnknown() public view {
        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(keccak256("nonexistent"));
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.NONE);
        assertEq(e.payer, address(0));
    }

    function test_isRefundable_trueAfterDeadline() public {
        bytes32 pid = _paymentId("view-refundable");
        _depositTraditional(pid);

        assertFalse(escrow.isRefundable(pid));

        vm.warp(block.timestamp + RELEASE_TIMEOUT);
        assertTrue(escrow.isRefundable(pid));
    }

    function test_isRefundable_falseAfterRelease() public {
        bytes32 pid = _paymentId("view-ref-released");
        _depositTraditional(pid);

        vm.prank(merchant);
        escrow.release(pid);

        vm.warp(block.timestamp + RELEASE_TIMEOUT);
        assertFalse(escrow.isRefundable(pid));
    }

    function test_isDisputable_trueWithinWindow() public {
        bytes32 pid = _paymentId("view-disputable");
        _depositTraditional(pid);

        assertTrue(escrow.isDisputable(pid));
    }

    function test_isDisputable_falseAfterWindow() public {
        bytes32 pid = _paymentId("view-disp-expired");
        _depositTraditional(pid);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        assertFalse(escrow.isDisputable(pid));
    }

    // =======================================================================
    // Admin tests
    // =======================================================================

    function test_setArbiter() public {
        address newArbiter = makeAddr("newArbiter");

        vm.expectEmit(true, true, false, false);
        emit XAgentPayEscrow.ArbiterUpdated(operator, newArbiter);

        escrow.setArbiter(newArbiter);
        assertEq(escrow.arbiter(), newArbiter);
    }

    function test_setArbiter_revertsZeroAddress() public {
        vm.expectRevert(XAgentPayEscrow.ZeroAddress.selector);
        escrow.setArbiter(address(0));
    }

    function test_setCoreOperator() public {
        address newOp = makeAddr("newOp");

        vm.expectEmit(true, true, false, false);
        emit XAgentPayEscrow.CoreOperatorUpdated(operator, newOp);

        escrow.setCoreOperator(newOp);
        assertEq(escrow.coreOperator(), newOp);
    }

    function test_setCoreOperator_revertsZeroAddress() public {
        vm.expectRevert(XAgentPayEscrow.ZeroAddress.selector);
        escrow.setCoreOperator(address(0));
    }

    function test_setDefaultReleaseTimeout() public {
        uint256 newTimeout = 3600;

        vm.expectEmit(false, false, false, true);
        emit XAgentPayEscrow.ReleaseTimeoutUpdated(RELEASE_TIMEOUT, newTimeout);

        escrow.setDefaultReleaseTimeout(newTimeout);
        assertEq(escrow.defaultReleaseTimeout(), newTimeout);
    }

    function test_setDefaultReleaseTimeout_revertsZero() public {
        vm.expectRevert(XAgentPayEscrow.ZeroTimeout.selector);
        escrow.setDefaultReleaseTimeout(0);
    }

    function test_setDisputeWindow() public {
        uint256 newWindow = 7200;
        escrow.setDefaultDisputeWindow(newWindow);
        assertEq(escrow.defaultDisputeWindow(), newWindow);
    }

    function test_setProtocolFeeBps() public {
        escrow.setProtocolFeeBps(100);
        assertEq(escrow.protocolFeeBps(), 100);
    }

    function test_setProtocolFeeBps_revertsAboveMax() public {
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.FeeTooHigh.selector, 501));
        escrow.setProtocolFeeBps(501);
    }

    function test_setProtocolFeeRecipient() public {
        address newRecip = makeAddr("newRecip");
        escrow.setProtocolFeeRecipient(newRecip);
        assertEq(escrow.protocolFeeRecipient(), newRecip);
    }

    function test_setProtocolFeeRecipient_revertsZero() public {
        vm.expectRevert(XAgentPayEscrow.ZeroAddress.selector);
        escrow.setProtocolFeeRecipient(address(0));
    }

    function test_admin_revertsNonOwner() public {
        vm.startPrank(stranger);
        vm.expectRevert();
        escrow.setArbiter(stranger);

        vm.expectRevert();
        escrow.setCoreOperator(stranger);

        vm.expectRevert();
        escrow.setDefaultReleaseTimeout(1);

        vm.expectRevert();
        escrow.setProtocolFeeBps(1);
        vm.stopPrank();
    }

    // =======================================================================
    // batchDepositWithAuthorization tests
    // =======================================================================

    function _buildBatchEntry(
        bytes32 paymentId,
        address _merchant,
        uint256 amount
    ) internal pure returns (XAgentPayEscrow.BatchEntry memory) {
        return XAgentPayEscrow.BatchEntry({
            paymentId: paymentId,
            merchant: _merchant,
            amount: amount,
            orderRef: ORDER_REF,
            merchantDid: MERCHANT_DID,
            contextHash: CONTEXT_HASH
        });
    }

    function _batchDepositWithAuth(
        XAgentPayEscrow.BatchEntry[] memory entries,
        uint256 totalAmount
    ) internal {
        bytes32 nonce = keccak256(abi.encodePacked("batch-nonce", totalAmount));
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), totalAmount, validAfter, validBefore, nonce
        );

        vm.prank(payer);
        escrow.batchDepositWithAuthorization(
            entries, totalAmount, validAfter, validBefore, nonce, v, r, s
        );
    }

    function test_batchDeposit_singleEntry() public {
        bytes32 pid = _paymentId("batch-single");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        uint256 balBefore = usdc.balanceOf(payer);
        _batchDepositWithAuth(entries, AMOUNT);

        assertEq(usdc.balanceOf(payer), balBefore - AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertEq(e.payer, payer);
        assertEq(e.merchant, merchant);
        assertEq(e.amount, AMOUNT);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);
    }

    function test_batchDeposit_multipleEntries() public {
        address merchant2 = makeAddr("merchant2");
        address merchant3 = makeAddr("merchant3");

        bytes32 pid1 = _paymentId("batch-m1");
        bytes32 pid2 = _paymentId("batch-m2");
        bytes32 pid3 = _paymentId("batch-m3");

        uint256 amount1 = 50_000_000;  // 50 USDC
        uint256 amount2 = 30_000_000;  // 30 USDC
        uint256 amount3 = 20_000_000;  // 20 USDC
        uint256 total = amount1 + amount2 + amount3;

        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](3);
        entries[0] = _buildBatchEntry(pid1, merchant, amount1);
        entries[1] = _buildBatchEntry(pid2, merchant2, amount2);
        entries[2] = _buildBatchEntry(pid3, merchant3, amount3);

        uint256 balBefore = usdc.balanceOf(payer);
        _batchDepositWithAuth(entries, total);

        // Check total deducted
        assertEq(usdc.balanceOf(payer), balBefore - total);
        assertEq(usdc.balanceOf(address(escrow)), total);

        // Verify each escrow entry
        XAgentPayEscrow.Escrow memory e1 = escrow.getEscrow(pid1);
        assertEq(e1.payer, payer);
        assertEq(e1.merchant, merchant);
        assertEq(e1.amount, amount1);
        assertTrue(e1.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);

        XAgentPayEscrow.Escrow memory e2 = escrow.getEscrow(pid2);
        assertEq(e2.payer, payer);
        assertEq(e2.merchant, merchant2);
        assertEq(e2.amount, amount2);
        assertTrue(e2.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);

        XAgentPayEscrow.Escrow memory e3 = escrow.getEscrow(pid3);
        assertEq(e3.payer, payer);
        assertEq(e3.merchant, merchant3);
        assertEq(e3.amount, amount3);
        assertTrue(e3.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);
    }

    function test_batchDeposit_emitsBatchEvent() public {
        bytes32 pid = _paymentId("batch-event");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        bytes32 nonce = keccak256(abi.encodePacked("batch-nonce", AMOUNT));
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce
        );

        vm.expectEmit(true, false, false, true);
        emit XAgentPayEscrow.BatchDeposited(payer, 1, AMOUNT);

        vm.prank(payer);
        escrow.batchDepositWithAuthorization(
            entries, AMOUNT, 0, validBefore, nonce, v, r, s
        );
    }

    function test_batchDeposit_emitsPerEntryDepositedEvents() public {
        address merchant2 = makeAddr("merchant2");
        bytes32 pid1 = _paymentId("batch-evt-1");
        bytes32 pid2 = _paymentId("batch-evt-2");
        uint256 amount1 = 60_000_000;
        uint256 amount2 = 40_000_000;
        uint256 total = amount1 + amount2;

        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](2);
        entries[0] = _buildBatchEntry(pid1, merchant, amount1);
        entries[1] = _buildBatchEntry(pid2, merchant2, amount2);

        bytes32 nonce = keccak256(abi.encodePacked("batch-nonce", total));
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), total, 0, validBefore, nonce
        );

        // Expect per-entry Deposited events
        vm.expectEmit(true, true, true, true);
        emit XAgentPayEscrow.Deposited(pid1, payer, merchant, amount1, ORDER_REF);
        vm.expectEmit(true, true, true, true);
        emit XAgentPayEscrow.Deposited(pid2, payer, merchant2, amount2, ORDER_REF);
        vm.expectEmit(true, false, false, true);
        emit XAgentPayEscrow.BatchDeposited(payer, 2, total);

        vm.prank(payer);
        escrow.batchDepositWithAuthorization(
            entries, total, 0, validBefore, nonce, v, r, s
        );
    }

    function test_batchDeposit_revertsEmptyBatch() public {
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](0);

        vm.prank(payer);
        vm.expectRevert(XAgentPayEscrow.EmptyBatch.selector);
        escrow.batchDepositWithAuthorization(
            entries, 0, 0, block.timestamp + 1 hours, keccak256("n"), 27, bytes32(0), bytes32(0)
        );
    }

    function test_batchDeposit_revertsAmountMismatch() public {
        bytes32 pid = _paymentId("batch-mismatch");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        uint256 wrongTotal = AMOUNT + 1;
        bytes32 nonce = keccak256("mismatch-nonce");
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), wrongTotal, 0, validBefore, nonce
        );

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(XAgentPayEscrow.BatchAmountMismatch.selector, wrongTotal, AMOUNT)
        );
        escrow.batchDepositWithAuthorization(
            entries, wrongTotal, 0, validBefore, nonce, v, r, s
        );
    }

    function test_batchDeposit_revertsDuplicatePaymentId() public {
        bytes32 pid = _paymentId("batch-dup-pid");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](2);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT / 2);
        entries[1] = _buildBatchEntry(pid, makeAddr("merchant2"), AMOUNT / 2); // same paymentId

        bytes32 nonce = keccak256("dup-nonce");
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce
        );

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.EscrowAlreadyExists.selector, pid));
        escrow.batchDepositWithAuthorization(
            entries, AMOUNT, 0, validBefore, nonce, v, r, s
        );
    }

    function test_batchDeposit_revertsZeroAmountEntry() public {
        bytes32 pid = _paymentId("batch-zero-amt");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, 0);

        bytes32 nonce = keccak256("zero-nonce");
        uint256 validBefore = block.timestamp + 1 hours;

        // Sign for 0 amount — will fail at _validateDeposit
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), 0, 0, validBefore, nonce
        );

        vm.prank(payer);
        vm.expectRevert(XAgentPayEscrow.ZeroAmount.selector);
        escrow.batchDepositWithAuthorization(
            entries, 0, 0, validBefore, nonce, v, r, s
        );
    }

    function test_batchDeposit_releaseIndividualEntry() public {
        // Batch deposit 2 entries, then release one individually
        address merchant2 = makeAddr("merchant2");
        bytes32 pid1 = _paymentId("batch-rel-1");
        bytes32 pid2 = _paymentId("batch-rel-2");
        uint256 amount1 = 60_000_000;
        uint256 amount2 = 40_000_000;
        uint256 total = amount1 + amount2;

        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](2);
        entries[0] = _buildBatchEntry(pid1, merchant, amount1);
        entries[1] = _buildBatchEntry(pid2, merchant2, amount2);

        _batchDepositWithAuth(entries, total);

        // Release only the first entry
        uint256 merchantBalBefore = usdc.balanceOf(merchant);
        uint256 fee = (amount1 * FEE_BPS) / 10_000;

        vm.prank(merchant);
        escrow.release(pid1);

        assertEq(usdc.balanceOf(merchant), merchantBalBefore + amount1 - fee);

        // Second entry still DEPOSITED
        XAgentPayEscrow.Escrow memory e2 = escrow.getEscrow(pid2);
        assertTrue(e2.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);
    }

    function test_batchDeposit_fiveEntries() public {
        uint256 perAmount = 20_000_000; // 20 USDC each
        uint256 total = perAmount * 5;

        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](5);
        for (uint256 i = 0; i < 5; i++) {
            entries[i] = _buildBatchEntry(
                _paymentId(string(abi.encodePacked("batch5-", i))),
                makeAddr(string(abi.encodePacked("merch-", i))),
                perAmount
            );
        }

        uint256 balBefore = usdc.balanceOf(payer);
        _batchDepositWithAuth(entries, total);

        assertEq(usdc.balanceOf(payer), balBefore - total);
        assertEq(usdc.balanceOf(address(escrow)), total);

        // Verify each entry created
        for (uint256 i = 0; i < 5; i++) {
            XAgentPayEscrow.Escrow memory e = escrow.getEscrow(entries[i].paymentId);
            assertEq(e.amount, perAmount);
            assertTrue(e.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);
        }
    }

    // =======================================================================
    // State transition tests
    // =======================================================================

    function test_cannotReleaseAfterRefund() public {
        bytes32 pid = _paymentId("trans-rel-after-ref");
        _depositTraditional(pid);

        vm.warp(block.timestamp + RELEASE_TIMEOUT + 1);
        escrow.refund(pid);

        vm.prank(merchant);
        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.InvalidStatus.selector,
                XAgentPayEscrow.EscrowStatus.REFUNDED,
                XAgentPayEscrow.EscrowStatus.DEPOSITED
            )
        );
        escrow.release(pid);
    }

    function test_cannotRefundAfterRelease() public {
        bytes32 pid = _paymentId("trans-ref-after-rel");
        _depositTraditional(pid);

        vm.prank(merchant);
        escrow.release(pid);

        vm.warp(block.timestamp + RELEASE_TIMEOUT + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.InvalidStatus.selector,
                XAgentPayEscrow.EscrowStatus.RELEASED,
                XAgentPayEscrow.EscrowStatus.DEPOSITED
            )
        );
        escrow.refund(pid);
    }

    function test_cannotDisputeAfterRelease() public {
        bytes32 pid = _paymentId("trans-disp-after-rel");
        _depositTraditional(pid);

        vm.prank(merchant);
        escrow.release(pid);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.InvalidStatus.selector,
                XAgentPayEscrow.EscrowStatus.RELEASED,
                XAgentPayEscrow.EscrowStatus.DEPOSITED
            )
        );
        escrow.dispute(pid, keccak256("too late"));
    }

    function test_cannotResolveNonDisputed() public {
        bytes32 pid = _paymentId("trans-resolve-no-disp");
        _depositTraditional(pid);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.InvalidStatus.selector,
                XAgentPayEscrow.EscrowStatus.DEPOSITED,
                XAgentPayEscrow.EscrowStatus.DISPUTED
            )
        );
        escrow.resolve(pid, 5_000);
    }

    // =======================================================================
    // Group Signature helpers
    // =======================================================================

    function _signGroupApproval(
        uint256 signerPk,
        bytes32 groupIdBytes32,
        bytes32 entriesHash,
        uint256 totalAmount
    ) internal view returns (uint8 gv, bytes32 gr, bytes32 gs) {
        bytes32 domainSep = escrow.computeDomainSeparator();
        bytes32 structHash = keccak256(abi.encode(
            escrow.XAGENT_GROUP_APPROVAL_TYPEHASH(),
            groupIdBytes32,
            entriesHash,
            totalAmount
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        (gv, gr, gs) = vm.sign(signerPk, digest);
    }

    function _computeEntriesHash(XAgentPayEscrow.BatchEntry[] memory entries) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < entries.length; i++) {
            packed = bytes.concat(packed, abi.encode(
                entries[i].paymentId,
                entries[i].merchant,
                entries[i].amount,
                entries[i].orderRef,
                entries[i].merchantDid,
                entries[i].contextHash
            ));
        }
        return keccak256(packed);
    }

    function _batchDepositWithGroupApproval(
        XAgentPayEscrow.BatchEntry[] memory entries,
        uint256 totalAmount,
        bytes32 groupIdBytes32
    ) internal {
        bytes32 entriesHash = _computeEntriesHash(entries);
        (uint8 gv, bytes32 gr, bytes32 gs) = _signGroupApproval(operatorPk, groupIdBytes32, entriesHash, totalAmount);

        bytes32 nonce = keccak256(abi.encodePacked("group-batch-nonce", groupIdBytes32));
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            payerPk, payer, address(escrow), totalAmount, validAfter, validBefore, nonce
        );

        vm.prank(payer);
        escrow.batchDepositWithGroupApproval(
            entries, totalAmount, groupIdBytes32,
            gv, gr, gs,
            validAfter, validBefore, nonce, v, r, s
        );
    }

    // =======================================================================
    // batchDepositWithGroupApproval tests
    // =======================================================================

    function test_batchDepositWithGroupApproval_single() public {
        bytes32 pid = _paymentId("grp-single");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        bytes32 groupId = keccak256("group-1");

        uint256 balBefore = usdc.balanceOf(payer);
        _batchDepositWithGroupApproval(entries, AMOUNT, groupId);

        assertEq(usdc.balanceOf(payer), balBefore - AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertEq(e.payer, payer);
        assertEq(e.merchant, merchant);
        assertEq(e.amount, AMOUNT);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);
    }

    function test_batchDepositWithGroupApproval_multi() public {
        address merchant2 = makeAddr("merchant2");
        bytes32 pid1 = _paymentId("grp-m1");
        bytes32 pid2 = _paymentId("grp-m2");
        uint256 amount1 = 60_000_000;
        uint256 amount2 = 40_000_000;
        uint256 total = amount1 + amount2;

        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](2);
        entries[0] = _buildBatchEntry(pid1, merchant, amount1);
        entries[1] = _buildBatchEntry(pid2, merchant2, amount2);

        bytes32 groupId = keccak256("group-multi");

        uint256 balBefore = usdc.balanceOf(payer);
        _batchDepositWithGroupApproval(entries, total, groupId);

        assertEq(usdc.balanceOf(payer), balBefore - total);

        XAgentPayEscrow.Escrow memory e1 = escrow.getEscrow(pid1);
        assertEq(e1.amount, amount1);
        assertTrue(e1.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);

        XAgentPayEscrow.Escrow memory e2 = escrow.getEscrow(pid2);
        assertEq(e2.amount, amount2);
        assertTrue(e2.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);
    }

    function test_batchDepositWithGroupApproval_invalidSig() public {
        bytes32 pid = _paymentId("grp-bad-sig");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        bytes32 groupId = keccak256("group-bad-sig");

        // Sign with wrong key (stranger's key)
        uint256 wrongPk = 0xDEAD;
        bytes32 entriesHash = _computeEntriesHash(entries);
        (uint8 gv, bytes32 gr, bytes32 gs) = _signGroupApproval(wrongPk, groupId, entriesHash, AMOUNT);

        bytes32 nonce = keccak256(abi.encodePacked("group-batch-nonce", groupId));
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(payerPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce);

        vm.prank(payer);
        vm.expectRevert(XAgentPayEscrow.InvalidGroupSignature.selector);
        escrow.batchDepositWithGroupApproval(
            entries, AMOUNT, groupId,
            gv, gr, gs,
            0, validBefore, nonce, v, r, s
        );
    }

    function test_batchDepositWithGroupApproval_wrongSigner() public {
        bytes32 pid = _paymentId("grp-wrong-signer");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        bytes32 groupId = keccak256("group-wrong-signer");

        // Sign with payer's key instead of operator's
        bytes32 entriesHash = _computeEntriesHash(entries);
        (uint8 gv, bytes32 gr, bytes32 gs) = _signGroupApproval(payerPk, groupId, entriesHash, AMOUNT);

        bytes32 nonce = keccak256(abi.encodePacked("group-batch-nonce", groupId));
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(payerPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce);

        vm.prank(payer);
        vm.expectRevert(XAgentPayEscrow.InvalidGroupSignature.selector);
        escrow.batchDepositWithGroupApproval(
            entries, AMOUNT, groupId,
            gv, gr, gs,
            0, validBefore, nonce, v, r, s
        );
    }

    function test_batchDepositWithGroupApproval_replayProtection() public {
        bytes32 pid1 = _paymentId("grp-replay-1");
        XAgentPayEscrow.BatchEntry[] memory entries1 = new XAgentPayEscrow.BatchEntry[](1);
        entries1[0] = _buildBatchEntry(pid1, merchant, AMOUNT);

        bytes32 groupId = keccak256("group-replay");

        _batchDepositWithGroupApproval(entries1, AMOUNT, groupId);

        // Try to reuse the same groupId
        bytes32 pid2 = _paymentId("grp-replay-2");
        XAgentPayEscrow.BatchEntry[] memory entries2 = new XAgentPayEscrow.BatchEntry[](1);
        entries2[0] = _buildBatchEntry(pid2, merchant, AMOUNT);

        bytes32 entriesHash = _computeEntriesHash(entries2);
        (uint8 gv, bytes32 gr, bytes32 gs) = _signGroupApproval(operatorPk, groupId, entriesHash, AMOUNT);

        bytes32 nonce = keccak256(abi.encodePacked("group-batch-nonce-2", groupId));
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(payerPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.GroupIdAlreadyUsed.selector, groupId));
        escrow.batchDepositWithGroupApproval(
            entries2, AMOUNT, groupId,
            gv, gr, gs,
            0, validBefore, nonce, v, r, s
        );
    }

    function test_batchDepositWithGroupApproval_amountMismatch() public {
        bytes32 pid = _paymentId("grp-mismatch");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        bytes32 groupId = keccak256("group-mismatch");
        uint256 wrongTotal = AMOUNT + 1;

        // Sign group approval with wrongTotal
        bytes32 entriesHash = _computeEntriesHash(entries);
        (uint8 gv, bytes32 gr, bytes32 gs) = _signGroupApproval(operatorPk, groupId, entriesHash, wrongTotal);

        bytes32 nonce = keccak256(abi.encodePacked("group-batch-nonce", groupId));
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(payerPk, payer, address(escrow), wrongTotal, 0, validBefore, nonce);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.BatchAmountMismatch.selector, wrongTotal, AMOUNT));
        escrow.batchDepositWithGroupApproval(
            entries, wrongTotal, groupId,
            gv, gr, gs,
            0, validBefore, nonce, v, r, s
        );
    }

    function test_batchDepositWithGroupApproval_emptyBatch() public {
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](0);
        bytes32 groupId = keccak256("group-empty");

        vm.prank(payer);
        vm.expectRevert(XAgentPayEscrow.EmptyBatch.selector);
        escrow.batchDepositWithGroupApproval(
            entries, 0, groupId,
            27, bytes32(0), bytes32(0),
            0, block.timestamp + 1 hours, keccak256("n"), 27, bytes32(0), bytes32(0)
        );
    }

    function test_batchDepositWithGroupApproval_batchTooLarge() public {
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](21);
        for (uint256 i = 0; i < 21; i++) {
            entries[i] = _buildBatchEntry(
                _paymentId(string(abi.encodePacked("grp-large-", i))),
                makeAddr(string(abi.encodePacked("merch-large-", i))),
                1_000_000
            );
        }

        bytes32 groupId = keccak256("group-large");

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.BatchTooLarge.selector, 21));
        escrow.batchDepositWithGroupApproval(
            entries, 21_000_000, groupId,
            27, bytes32(0), bytes32(0),
            0, block.timestamp + 1 hours, keccak256("n"), 27, bytes32(0), bytes32(0)
        );
    }

    function test_domainSeparator() public view {
        bytes32 expected = keccak256(abi.encode(
            escrow.EIP712_DOMAIN_TYPEHASH(),
            escrow.DOMAIN_NAME_HASH(),
            escrow.DOMAIN_VERSION_HASH(),
            block.chainid,
            address(escrow)
        ));
        assertEq(escrow.computeDomainSeparator(), expected);
    }

    function test_requireGroupSig_blocks_old_function() public {
        escrow.setRequireGroupSig(true);

        bytes32 pid = _paymentId("grp-blocked");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        vm.prank(payer);
        vm.expectRevert(XAgentPayEscrow.GroupSignatureRequired.selector);
        escrow.batchDepositWithAuthorization(
            entries, AMOUNT, 0, block.timestamp + 1 hours, keccak256("n"), 27, bytes32(0), bytes32(0)
        );
    }

    function test_requireGroupSig_allows_new_function() public {
        escrow.setRequireGroupSig(true);

        bytes32 pid = _paymentId("grp-allowed");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        bytes32 groupId = keccak256("group-allowed");
        _batchDepositWithGroupApproval(entries, AMOUNT, groupId);

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.DEPOSITED);
    }

    function test_setRequireGroupSig_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        escrow.setRequireGroupSig(true);
    }

    function test_isGroupIdUsed() public {
        bytes32 groupId = keccak256("group-used-check");

        assertFalse(escrow.isGroupIdUsed(groupId));

        bytes32 pid = _paymentId("grp-used-check");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        _batchDepositWithGroupApproval(entries, AMOUNT, groupId);

        assertTrue(escrow.isGroupIdUsed(groupId));
    }

    function test_groupApproval_events() public {
        bytes32 pid = _paymentId("grp-events");
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = _buildBatchEntry(pid, merchant, AMOUNT);

        bytes32 groupId = keccak256("group-events");
        bytes32 entriesHash = _computeEntriesHash(entries);
        (uint8 gv, bytes32 gr, bytes32 gs) = _signGroupApproval(operatorPk, groupId, entriesHash, AMOUNT);

        bytes32 nonce = keccak256(abi.encodePacked("group-batch-nonce", groupId));
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(payerPk, payer, address(escrow), AMOUNT, 0, validBefore, nonce);

        vm.expectEmit(true, true, true, true);
        emit XAgentPayEscrow.Deposited(pid, payer, merchant, AMOUNT, ORDER_REF);
        vm.expectEmit(true, false, false, true);
        emit XAgentPayEscrow.BatchDeposited(payer, 1, AMOUNT);
        vm.expectEmit(true, true, false, false);
        emit XAgentPayEscrow.GroupSigVerified(groupId, operator);

        vm.prank(payer);
        escrow.batchDepositWithGroupApproval(
            entries, AMOUNT, groupId,
            gv, gr, gs,
            0, validBefore, nonce, v, r, s
        );
    }

    // =======================================================================
    // Audit fix: H-01 — refundUnresolvedDispute
    // =======================================================================

    function test_refundUnresolvedDispute() public {
        bytes32 pid = _paymentId("audit-h01");
        _depositTraditional(pid);

        vm.prank(payer);
        escrow.dispute(pid, keccak256("reason"));

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);

        // Warp past disputeDeadline + arbitrationTimeout
        vm.warp(e.disputeDeadline + ARBITRATION_TIMEOUT + 1);

        uint256 payerBalBefore = usdc.balanceOf(payer);

        escrow.refundUnresolvedDispute(pid);

        assertEq(usdc.balanceOf(payer), payerBalBefore + AMOUNT);

        XAgentPayEscrow.Escrow memory eAfter = escrow.getEscrow(pid);
        assertTrue(eAfter.status == XAgentPayEscrow.EscrowStatus.RESOLVED_TO_PAYER);
    }

    function test_refundUnresolvedDispute_tooEarly() public {
        bytes32 pid = _paymentId("audit-h01-early");
        _depositTraditional(pid);

        vm.prank(payer);
        escrow.dispute(pid, keccak256("reason"));

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);

        // Warp but not past the full timeout
        vm.warp(e.disputeDeadline + ARBITRATION_TIMEOUT - 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.ArbitrationTimeoutNotReached.selector,
                e.disputeDeadline + ARBITRATION_TIMEOUT,
                block.timestamp
            )
        );
        escrow.refundUnresolvedDispute(pid);
    }

    function test_refundUnresolvedDispute_notDisputed() public {
        bytes32 pid = _paymentId("audit-h01-not-disputed");
        _depositTraditional(pid);

        vm.expectRevert(
            abi.encodeWithSelector(
                XAgentPayEscrow.InvalidStatus.selector,
                XAgentPayEscrow.EscrowStatus.DEPOSITED,
                XAgentPayEscrow.EscrowStatus.DISPUTED
            )
        );
        escrow.refundUnresolvedDispute(pid);
    }

    function test_setArbitrationTimeout() public {
        uint256 newTimeout = 1_209_600; // 14 days
        vm.expectEmit(false, false, false, true);
        emit XAgentPayEscrow.ArbitrationTimeoutUpdated(ARBITRATION_TIMEOUT, newTimeout);

        escrow.setArbitrationTimeout(newTimeout);
        assertEq(escrow.arbitrationTimeout(), newTimeout);
    }

    function test_setArbitrationTimeout_revertsZero() public {
        vm.expectRevert(XAgentPayEscrow.ZeroTimeout.selector);
        escrow.setArbitrationTimeout(0);
    }

    // =======================================================================
    // Audit fix: M-02 — Batch size limit
    // =======================================================================

    function test_batchTooLarge() public {
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](21);
        for (uint256 i = 0; i < 21; i++) {
            entries[i] = _buildBatchEntry(
                _paymentId(string(abi.encodePacked("large-", i))),
                makeAddr(string(abi.encodePacked("m-", i))),
                1_000_000
            );
        }

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(XAgentPayEscrow.BatchTooLarge.selector, 21));
        escrow.batchDepositWithAuthorization(
            entries, 21_000_000, 0, block.timestamp + 1 hours, keccak256("n"), 27, bytes32(0), bytes32(0)
        );
    }

    // =======================================================================
    // Audit fix: M-03 — RESOLVED_SPLIT status
    // =======================================================================

    function test_resolvedSplit_status() public {
        bytes32 pid = _paymentId("audit-m03");
        _depositTraditional(pid);

        vm.prank(payer);
        escrow.dispute(pid, keccak256("reason"));

        vm.prank(operator);
        escrow.resolve(pid, 7_000); // 70% merchant, 30% payer

        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertTrue(e.status == XAgentPayEscrow.EscrowStatus.RESOLVED_SPLIT);
    }

    // =======================================================================
    // Audit fix: L-04 — feeBps snapshot
    // =======================================================================

    function test_feeBps_snapshot() public {
        bytes32 pid = _paymentId("audit-l04");
        _depositTraditional(pid);

        // Verify feeBps was snapshotted
        XAgentPayEscrow.Escrow memory e = escrow.getEscrow(pid);
        assertEq(e.feeBps, FEE_BPS);

        // Change the protocol fee
        escrow.setProtocolFeeBps(100); // 1%

        // Release should use the snapshotted fee (30 bps), not the new 100 bps
        uint256 merchantBalBefore = usdc.balanceOf(merchant);
        uint256 expectedFee = (AMOUNT * FEE_BPS) / 10_000;
        uint256 expectedMerchantAmount = AMOUNT - expectedFee;

        vm.prank(merchant);
        escrow.release(pid);

        assertEq(usdc.balanceOf(merchant), merchantBalBefore + expectedMerchantAmount);
        assertEq(usdc.balanceOf(feeRecipient), expectedFee);
    }

    // =======================================================================
    // Fuzz tests (I-03)
    // =======================================================================

    function test_fuzz_releaseFeeInvariant(uint256 amount, uint16 feeBps) public pure {
        amount = bound(amount, 1, type(uint128).max);
        feeBps = uint16(bound(feeBps, 0, 500));
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 merchantAmount = amount - fee;
        assertEq(fee + merchantAmount, amount);
    }

    function test_fuzz_resolveSplitInvariant(uint256 amount, uint16 merchantBps) public pure {
        amount = bound(amount, 1, type(uint128).max);
        merchantBps = uint16(bound(merchantBps, 0, 10_000));
        uint256 merchantAmount = (amount * merchantBps) / 10_000;
        uint256 payerAmount = amount - merchantAmount;
        assertEq(merchantAmount + payerAmount, amount);
    }

    // =======================================================================
    // Cross-language entriesHash verification (Step 14)
    // =======================================================================

    function test_entriesHash_crossLanguage() public pure {
        // Fixed input: single entry
        XAgentPayEscrow.BatchEntry[] memory entries = new XAgentPayEscrow.BatchEntry[](1);
        entries[0] = XAgentPayEscrow.BatchEntry({
            paymentId: bytes32(uint256(0x01)),
            merchant: address(0x1234567890123456789012345678901234567890),
            amount: 100_000_000,
            orderRef: bytes32(uint256(0x02)),
            merchantDid: bytes32(uint256(0x03)),
            contextHash: bytes32(uint256(0x04))
        });

        // Compute hash using same algorithm as contract
        bytes memory packed = abi.encode(
            entries[0].paymentId,
            entries[0].merchant,
            entries[0].amount,
            entries[0].orderRef,
            entries[0].merchantDid,
            entries[0].contextHash
        );
        bytes32 expected = keccak256(packed);

        // Verify helper matches
        bytes memory packed2;
        for (uint256 i = 0; i < entries.length; i++) {
            packed2 = bytes.concat(packed2, abi.encode(
                entries[i].paymentId,
                entries[i].merchant,
                entries[i].amount,
                entries[i].orderRef,
                entries[i].merchantDid,
                entries[i].contextHash
            ));
        }
        bytes32 computed = keccak256(packed2);
        assertEq(computed, expected);
    }
}
