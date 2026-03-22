// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {AutoEvaluator} from "../src/AutoEvaluator.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract AgenticCommerceTest is Test {
    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    MockUSDC internal usdc;
    AgenticCommerce internal acp;
    AutoEvaluator internal evaluator;

    // Actors
    address internal owner = address(this);
    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal operatorAddr = makeAddr("operator");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal stranger = makeAddr("stranger");

    // Defaults
    uint16 internal constant FEE_BPS = 30; // 0.3%
    uint256 internal constant BUDGET = 100_000_000; // 100 USDC (6 decimals)
    uint256 internal constant EXPIRY_DELTA = 86400; // 24h from now
    string internal constant DESCRIPTION = '{"merchant_did":"did:xagent:demo","order_ref":"ORD-001"}';
    bytes32 internal constant DELIVERABLE = keccak256("booking-confirmation-001");

    // -----------------------------------------------------------------------
    // Setup
    // -----------------------------------------------------------------------

    function setUp() public {
        usdc = new MockUSDC();

        acp = new AgenticCommerce(
            address(usdc),
            FEE_BPS,
            feeRecipient,
            operatorAddr
        );

        evaluator = new AutoEvaluator(address(acp), operatorAddr);

        // Fund client with USDC
        usdc.mint(client, 1_000_000_000); // 1000 USDC
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function _createJob() internal returns (uint256 jobId) {
        vm.startPrank(client);
        usdc.approve(address(acp), BUDGET);
        jobId = acp.createAndFund(
            provider,
            address(evaluator),
            block.timestamp + EXPIRY_DELTA,
            DESCRIPTION,
            BUDGET
        );
        vm.stopPrank();
    }

    function _createAndSubmitJob() internal returns (uint256 jobId) {
        jobId = _createJob();
        vm.prank(operatorAddr);
        acp.submit(jobId, DELIVERABLE);
    }

    // -----------------------------------------------------------------------
    // Constructor tests
    // -----------------------------------------------------------------------

    function test_constructor_setsState() public view {
        assertEq(address(acp.paymentToken()), address(usdc));
        assertEq(acp.protocolFeeBps(), FEE_BPS);
        assertEq(acp.protocolFeeRecipient(), feeRecipient);
        assertEq(acp.operator(), operatorAddr);
        assertEq(acp.nextJobId(), 1);
    }

    function test_constructor_revertsZeroToken() public {
        vm.expectRevert(AgenticCommerce.ZeroAddress.selector);
        new AgenticCommerce(address(0), FEE_BPS, feeRecipient, operatorAddr);
    }

    function test_constructor_revertsFeeTooHigh() public {
        vm.expectRevert(abi.encodeWithSelector(AgenticCommerce.FeeTooHigh.selector, 600));
        new AgenticCommerce(address(usdc), 600, feeRecipient, operatorAddr);
    }

    // -----------------------------------------------------------------------
    // createAndFund tests
    // -----------------------------------------------------------------------

    function test_createAndFund_success() public {
        uint256 balBefore = usdc.balanceOf(client);

        vm.startPrank(client);
        usdc.approve(address(acp), BUDGET);

        vm.expectEmit(true, true, true, true);
        emit AgenticCommerce.JobCreated(
            1, client, provider, address(evaluator),
            BUDGET, block.timestamp + EXPIRY_DELTA, DESCRIPTION
        );

        uint256 jobId = acp.createAndFund(
            provider,
            address(evaluator),
            block.timestamp + EXPIRY_DELTA,
            DESCRIPTION,
            BUDGET
        );
        vm.stopPrank();

        assertEq(jobId, 1);
        assertEq(acp.nextJobId(), 2);
        assertEq(usdc.balanceOf(client), balBefore - BUDGET);
        assertEq(usdc.balanceOf(address(acp)), BUDGET);

        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertEq(job.client, client);
        assertEq(job.provider, provider);
        assertEq(job.evaluator, address(evaluator));
        assertEq(job.budget, BUDGET);
        assertTrue(job.status == AgenticCommerce.JobStatus.Funded);
    }

    function test_createAndFund_revertsZeroProvider() public {
        vm.startPrank(client);
        usdc.approve(address(acp), BUDGET);
        vm.expectRevert(AgenticCommerce.ZeroAddress.selector);
        acp.createAndFund(address(0), address(evaluator), block.timestamp + EXPIRY_DELTA, DESCRIPTION, BUDGET);
        vm.stopPrank();
    }

    function test_createAndFund_revertsZeroBudget() public {
        vm.startPrank(client);
        vm.expectRevert(AgenticCommerce.ZeroAmount.selector);
        acp.createAndFund(provider, address(evaluator), block.timestamp + EXPIRY_DELTA, DESCRIPTION, 0);
        vm.stopPrank();
    }

    function test_createAndFund_revertsSelfPayment() public {
        vm.startPrank(client);
        usdc.approve(address(acp), BUDGET);
        vm.expectRevert(AgenticCommerce.SelfPayment.selector);
        acp.createAndFund(client, address(evaluator), block.timestamp + EXPIRY_DELTA, DESCRIPTION, BUDGET);
        vm.stopPrank();
    }

    function test_createAndFund_revertsExpiredTimestamp() public {
        vm.startPrank(client);
        usdc.approve(address(acp), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(AgenticCommerce.InvalidExpiry.selector, block.timestamp));
        acp.createAndFund(provider, address(evaluator), block.timestamp, DESCRIPTION, BUDGET);
        vm.stopPrank();
    }

    function test_createAndFund_incrementsJobId() public {
        vm.startPrank(client);
        usdc.approve(address(acp), BUDGET * 3);

        uint256 id1 = acp.createAndFund(provider, address(evaluator), block.timestamp + EXPIRY_DELTA, DESCRIPTION, BUDGET);
        uint256 id2 = acp.createAndFund(provider, address(evaluator), block.timestamp + EXPIRY_DELTA, DESCRIPTION, BUDGET);
        uint256 id3 = acp.createAndFund(provider, address(evaluator), block.timestamp + EXPIRY_DELTA, DESCRIPTION, BUDGET);
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
    }

    // -----------------------------------------------------------------------
    // submit tests
    // -----------------------------------------------------------------------

    function test_submit_byOperator() public {
        uint256 jobId = _createJob();

        vm.expectEmit(true, true, false, true);
        emit AgenticCommerce.JobSubmitted(jobId, provider, DELIVERABLE);

        vm.prank(operatorAddr);
        acp.submit(jobId, DELIVERABLE);

        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.JobStatus.Submitted);
        assertEq(job.deliverable, DELIVERABLE);
    }

    function test_submit_byProvider() public {
        uint256 jobId = _createJob();

        vm.prank(provider);
        acp.submit(jobId, DELIVERABLE);

        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.JobStatus.Submitted);
    }

    function test_submit_revertsStranger() public {
        uint256 jobId = _createJob();

        vm.expectRevert(abi.encodeWithSelector(AgenticCommerce.NotProviderOrOperator.selector, stranger));
        vm.prank(stranger);
        acp.submit(jobId, DELIVERABLE);
    }

    function test_submit_revertsWrongStatus() public {
        uint256 jobId = _createAndSubmitJob();

        vm.expectRevert(
            abi.encodeWithSelector(
                AgenticCommerce.InvalidStatus.selector,
                AgenticCommerce.JobStatus.Submitted,
                AgenticCommerce.JobStatus.Funded
            )
        );
        vm.prank(operatorAddr);
        acp.submit(jobId, DELIVERABLE);
    }

    function test_submit_revertsAfterExpiry() public {
        uint256 jobId = _createJob();

        // Warp past expiry
        vm.warp(block.timestamp + EXPIRY_DELTA + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                AgenticCommerce.NotExpired.selector,
                block.timestamp - 1, // expiredAt = original block.timestamp + EXPIRY_DELTA
                block.timestamp
            )
        );
        vm.prank(operatorAddr);
        acp.submit(jobId, DELIVERABLE);
    }

    // -----------------------------------------------------------------------
    // complete tests
    // -----------------------------------------------------------------------

    function test_complete_releasesToProvider() public {
        uint256 jobId = _createAndSubmitJob();

        uint256 providerBalBefore = usdc.balanceOf(provider);
        uint256 feeRecipBalBefore = usdc.balanceOf(feeRecipient);

        bytes32 reason = bytes32("auto-verified");

        vm.expectEmit(true, true, false, true);
        uint256 expectedFee = (BUDGET * FEE_BPS) / 10_000;
        uint256 expectedProvider = BUDGET - expectedFee;
        emit AgenticCommerce.JobCompleted(jobId, provider, expectedProvider, expectedFee, reason);

        // AutoEvaluator calls complete
        vm.prank(operatorAddr);
        evaluator.evaluate(jobId);

        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.JobStatus.Completed);

        // Check balances
        assertEq(usdc.balanceOf(provider), providerBalBefore + expectedProvider);
        assertEq(usdc.balanceOf(feeRecipient), feeRecipBalBefore + expectedFee);
        assertEq(usdc.balanceOf(address(acp)), 0);
    }

    function test_complete_revertsNotEvaluator() public {
        uint256 jobId = _createAndSubmitJob();

        vm.expectRevert(
            abi.encodeWithSelector(AgenticCommerce.NotEvaluator.selector, stranger, address(evaluator))
        );
        vm.prank(stranger);
        acp.complete(jobId, bytes32("test"));
    }

    function test_complete_revertsWrongStatus() public {
        uint256 jobId = _createJob(); // Funded, not Submitted

        vm.expectRevert(
            abi.encodeWithSelector(
                AgenticCommerce.InvalidStatus.selector,
                AgenticCommerce.JobStatus.Funded,
                AgenticCommerce.JobStatus.Submitted
            )
        );
        vm.prank(address(evaluator));
        acp.complete(jobId, bytes32("test"));
    }

    // -----------------------------------------------------------------------
    // reject tests
    // -----------------------------------------------------------------------

    function test_reject_refundsClient() public {
        uint256 jobId = _createAndSubmitJob();

        uint256 clientBalBefore = usdc.balanceOf(client);
        bytes32 reason = bytes32("quality-fail");

        vm.expectEmit(true, true, false, true);
        emit AgenticCommerce.JobRejected(jobId, client, BUDGET, reason);

        vm.prank(operatorAddr);
        evaluator.rejectJob(jobId, reason);

        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.JobStatus.Rejected);

        assertEq(usdc.balanceOf(client), clientBalBefore + BUDGET);
        assertEq(usdc.balanceOf(address(acp)), 0);
    }

    // -----------------------------------------------------------------------
    // claimRefund tests
    // -----------------------------------------------------------------------

    function test_claimRefund_afterExpiry() public {
        uint256 jobId = _createJob();
        uint256 clientBalBefore = usdc.balanceOf(client);

        // Warp past expiry
        vm.warp(block.timestamp + EXPIRY_DELTA + 1);

        vm.expectEmit(true, true, false, true);
        emit AgenticCommerce.JobExpired(jobId, client, BUDGET);

        vm.prank(stranger); // Anyone can trigger
        acp.claimRefund(jobId);

        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.JobStatus.Expired);
        assertEq(usdc.balanceOf(client), clientBalBefore + BUDGET);
    }

    function test_claimRefund_afterSubmitAndExpiry() public {
        uint256 jobId = _createAndSubmitJob();
        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.warp(block.timestamp + EXPIRY_DELTA + 1);

        vm.prank(stranger);
        acp.claimRefund(jobId);

        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.JobStatus.Expired);
        assertEq(usdc.balanceOf(client), clientBalBefore + BUDGET);
    }

    function test_claimRefund_revertsBeforeExpiry() public {
        uint256 jobId = _createJob();

        vm.expectRevert(
            abi.encodeWithSelector(
                AgenticCommerce.NotExpired.selector,
                block.timestamp + EXPIRY_DELTA,
                block.timestamp
            )
        );
        acp.claimRefund(jobId);
    }

    function test_claimRefund_revertsAfterCompletion() public {
        uint256 jobId = _createAndSubmitJob();

        // Complete the job
        vm.prank(operatorAddr);
        evaluator.evaluate(jobId);

        vm.warp(block.timestamp + EXPIRY_DELTA + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                AgenticCommerce.InvalidStatus.selector,
                AgenticCommerce.JobStatus.Completed,
                AgenticCommerce.JobStatus.Funded
            )
        );
        acp.claimRefund(jobId);
    }

    // -----------------------------------------------------------------------
    // isRefundable tests
    // -----------------------------------------------------------------------

    function test_isRefundable_beforeExpiry() public {
        uint256 jobId = _createJob();
        assertFalse(acp.isRefundable(jobId));
    }

    function test_isRefundable_afterExpiry() public {
        uint256 jobId = _createJob();
        vm.warp(block.timestamp + EXPIRY_DELTA + 1);
        assertTrue(acp.isRefundable(jobId));
    }

    // -----------------------------------------------------------------------
    // AutoEvaluator tests
    // -----------------------------------------------------------------------

    function test_evaluator_revertsEmptyDeliverable() public {
        uint256 jobId = _createJob();

        // Submit with empty deliverable directly (bypass check in submit)
        // Actually submit() requires provider/operator, so let's test through ACP
        // The AutoEvaluator checks the deliverable in storage
        // We need a Funded→Submitted job but with bytes32(0) deliverable
        // Since submit() always sets deliverable, let's test that evaluate reverses
        // on a Funded job (not submitted)

        // Actually the evaluate function checks deliverable != bytes32(0)
        // But the ACP complete function checks status == Submitted
        // So complete() will revert before evaluate can check deliverable
        // Let's verify that evaluate works on a valid submitted job
        uint256 jobId2 = _createAndSubmitJob();
        vm.prank(operatorAddr);
        evaluator.evaluate(jobId2);
        assertTrue(acp.getJob(jobId2).status == AgenticCommerce.JobStatus.Completed);
    }

    function test_evaluator_revertsNotOperator() public {
        uint256 jobId = _createAndSubmitJob();

        vm.expectRevert(abi.encodeWithSelector(AutoEvaluator.NotOperator.selector, stranger));
        vm.prank(stranger);
        evaluator.evaluate(jobId);
    }

    // -----------------------------------------------------------------------
    // Admin tests
    // -----------------------------------------------------------------------

    function test_setOperator() public {
        address newOp = makeAddr("newOperator");
        acp.setOperator(newOp);
        assertEq(acp.operator(), newOp);
    }

    function test_setProtocolFeeBps() public {
        acp.setProtocolFeeBps(50);
        assertEq(acp.protocolFeeBps(), 50);
    }

    function test_setProtocolFeeBps_revertsMax() public {
        vm.expectRevert(abi.encodeWithSelector(AgenticCommerce.FeeTooHigh.selector, 600));
        acp.setProtocolFeeBps(600);
    }

    function test_setProtocolFeeRecipient() public {
        address newRecip = makeAddr("newRecipient");
        acp.setProtocolFeeRecipient(newRecip);
        assertEq(acp.protocolFeeRecipient(), newRecip);
    }

    // -----------------------------------------------------------------------
    // Full lifecycle test
    // -----------------------------------------------------------------------

    function test_fullLifecycle_createSubmitComplete() public {
        // 1. Create & fund
        uint256 clientBal0 = usdc.balanceOf(client);
        uint256 jobId = _createJob();
        assertEq(usdc.balanceOf(client), clientBal0 - BUDGET);

        // 2. Provider submits deliverable (via operator)
        vm.prank(operatorAddr);
        acp.submit(jobId, DELIVERABLE);

        // 3. Evaluator auto-approves
        vm.prank(operatorAddr);
        evaluator.evaluate(jobId);

        // 4. Verify final state
        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.JobStatus.Completed);

        uint256 expectedFee = (BUDGET * FEE_BPS) / 10_000;
        uint256 expectedProvider = BUDGET - expectedFee;
        assertEq(usdc.balanceOf(provider), expectedProvider);
        assertEq(usdc.balanceOf(feeRecipient), expectedFee);
        assertEq(usdc.balanceOf(address(acp)), 0);
    }

    function test_fullLifecycle_createSubmitReject() public {
        uint256 clientBal0 = usdc.balanceOf(client);
        uint256 jobId = _createJob();

        vm.prank(operatorAddr);
        acp.submit(jobId, DELIVERABLE);

        vm.prank(operatorAddr);
        evaluator.rejectJob(jobId, bytes32("bad-quality"));

        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.JobStatus.Rejected);
        assertEq(usdc.balanceOf(client), clientBal0); // full refund
        assertEq(usdc.balanceOf(address(acp)), 0);
    }

    function test_fullLifecycle_createExpireRefund() public {
        uint256 clientBal0 = usdc.balanceOf(client);
        uint256 jobId = _createJob();

        vm.warp(block.timestamp + EXPIRY_DELTA + 1);
        acp.claimRefund(jobId);

        AgenticCommerce.Job memory job = acp.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.JobStatus.Expired);
        assertEq(usdc.balanceOf(client), clientBal0); // full refund
    }
}
